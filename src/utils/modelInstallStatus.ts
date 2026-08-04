import {NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {directories, getExistingDownloadTasks} from '@kesha-antonov/react-native-background-downloader';
import {
  findCatalogModel,
  getModelTaskId,
  ModelCatalogItem,
} from '../data/modelCatalog';

type FileInfo = {
  exists: boolean;
  isGguf?: boolean;
  readable?: boolean;
  size: number;
};

type RivoModelFileModule = {
  legacyExternalModelDirectory?: string;
  modelDirectory?: string;
  copyFile?: (sourcePath: string, destinationPath: string) => Promise<boolean>;
  getFileInfo: (path: string) => Promise<FileInfo>;
  deleteFile?: (path: string) => Promise<boolean>;
};

const modelFileModule = NativeModules.RivoModelFile as RivoModelFileModule | undefined;

export const deleteModelFile = async (fileName: string): Promise<boolean> => {
  if (!modelFileModule?.deleteFile) {
    return false;
  }

  try {
    const paths = getCandidateModelFilePaths(fileName);
    let allDeleted = true;
    for (const path of paths) {
      const fileInfo = await modelFileModule.getFileInfo(path);
      if (fileInfo.exists) {
        const result = await modelFileModule.deleteFile(path);
        if (!result) {
          allDeleted = false;
        }
      }
    }
    return allDeleted;
  } catch (error) {
    console.warn('Model install status: failed to delete model file:', error);
    return false;
  }
};
const primaryModelDirectory = modelFileModule?.modelDirectory ?? directories.documents;
const legacyExternalModelDirectory = modelFileModule?.legacyExternalModelDirectory;

export const getModelFilePath = (fileName: string) => `${primaryModelDirectory}/${fileName}`;

const getLegacyModelFilePath = (fileName: string) => `${directories.documents}/${fileName}`;

const getLegacyExternalModelFilePath = (fileName: string) =>
  legacyExternalModelDirectory ? `${legacyExternalModelDirectory}/${fileName}` : null;

export const getModelDownloadFilePath = (fileName: string) =>
  getLegacyExternalModelFilePath(fileName) ?? getModelFilePath(fileName);

const getCandidateModelFilePaths = (fileName: string) =>
  Array.from(
    new Set(
      [
        getModelFilePath(fileName),
        getLegacyModelFilePath(fileName),
        getLegacyExternalModelFilePath(fileName),
      ].filter((path): path is string => Boolean(path)),
    ),
  );

const isCompleteModelFile = (
  model: Pick<ModelCatalogItem, 'byteSize'>,
  fileInfo: FileInfo,
) => {
  const minimumCompleteSize = model.byteSize * 0.99;
  return (
    fileInfo.exists &&
    fileInfo.readable !== false &&
    fileInfo.isGguf !== false &&
    fileInfo.size >= minimumCompleteSize
  );
};

const copyModelToPrimaryPath = async (
  model: Pick<ModelCatalogItem, 'byteSize'>,
  fileName: string,
  sourcePath: string,
) => {
  const primaryPath = getModelFilePath(fileName);
  if (sourcePath === primaryPath || !modelFileModule?.copyFile) {
    return sourcePath;
  }

  try {
    await modelFileModule.copyFile(sourcePath, primaryPath);
    const migratedInfo = await modelFileModule.getFileInfo(primaryPath);
    if (isCompleteModelFile(model, migratedInfo)) {
      return primaryPath;
    }
  } catch (error) {
    console.warn('Model install status: failed to migrate model file:', error);
  }

  return sourcePath;
};

export const markModelInstalled = async (
  model: Pick<ModelCatalogItem, 'id' | 'name' | 'byteSize'>,
  fileName: string,
  sizeBytes?: number,
) => {
  const resolvedSize = String(sizeBytes && sizeBytes > 0 ? sizeBytes : model.byteSize);
  await AsyncStorage.multiSet([
    ['modelDownloadComplete', 'true'],
    ['selectedModelId', model.id],
    ['selectedModelName', model.name],
    ['selectedModelFileName', fileName],
    ['selectedModelSizeBytes', resolvedSize],
    ['downloadedModelId', model.id],
    ['downloadedModelName', model.name],
    ['downloadedModelFileName', fileName],
    ['downloadedModelSizeBytes', resolvedSize],
  ]);
};

export const isModelFileInstalled = async (
  model: Pick<ModelCatalogItem, 'byteSize'>,
  fileName: string,
) => {
  return Boolean(await getInstalledModelFilePath(model, fileName));
};

export const getInstalledModelFilePath = async (
  model: Pick<ModelCatalogItem, 'byteSize'>,
  fileName: string,
) => {
  if (!modelFileModule) {
    return null;
  }

  for (const candidatePath of getCandidateModelFilePaths(fileName)) {
    let fileInfo: FileInfo;
    try {
      fileInfo = await modelFileModule.getFileInfo(candidatePath);
    } catch (error) {
      console.warn('Model install status: failed to inspect model file:', error);
      continue;
    }

    if (isCompleteModelFile(model, fileInfo)) {
      return copyModelToPrimaryPath(model, fileName, candidatePath);
    }
  }

  return null;
};

export const getSelectedInstalledModel = async () => {
  const [
    selectedId,
    selectedName,
    selectedFileName,
    selectedSizeBytes,
    downloadedId,
    downloadedName,
    downloadedFileName,
    downloadedSizeBytes,
    downloadComplete,
  ] = await Promise.all([
    AsyncStorage.getItem('selectedModelId'),
    AsyncStorage.getItem('selectedModelName'),
    AsyncStorage.getItem('selectedModelFileName'),
    AsyncStorage.getItem('selectedModelSizeBytes'),
    AsyncStorage.getItem('downloadedModelId'),
    AsyncStorage.getItem('downloadedModelName'),
    AsyncStorage.getItem('downloadedModelFileName'),
    AsyncStorage.getItem('downloadedModelSizeBytes'),
    AsyncStorage.getItem('modelDownloadComplete'),
  ]);

  const storedId = selectedId || downloadedId;
  const storedName = selectedName || downloadedName;

  if (!storedId && !storedName && !downloadedFileName) {
    return null;
  }

  const model = findCatalogModel(storedId, storedName);
  const fileName = selectedFileName || downloadedFileName || model.fileName;
  const storedSize = Number(selectedSizeBytes || downloadedSizeBytes);
  const expectedSize = Math.max(storedSize > 0 ? storedSize : 0, model.byteSize);
  const modelWithStoredSize = {
    ...model,
    byteSize: expectedSize,
  };

  const installedFilePath = await getInstalledModelFilePath(modelWithStoredSize, fileName);

  if (downloadComplete === 'true' && installedFilePath) {
    await markModelInstalled(modelWithStoredSize, fileName, modelWithStoredSize.byteSize);
    return {model: modelWithStoredSize, fileName, filePath: installedFilePath};
  }

  const tasks = await getExistingDownloadTasks();
  const completedTask = tasks.find(
    task => task.id === getModelTaskId({id: model.id, fileName}) && task.state === 'DONE',
  );

  if (completedTask && (installedFilePath || !modelFileModule)) {
    await markModelInstalled(
      modelWithStoredSize,
      fileName,
      completedTask.bytesTotal || modelWithStoredSize.byteSize,
    );
    return {model: modelWithStoredSize, fileName, filePath: installedFilePath ?? getModelFilePath(fileName)};
  }

  if (installedFilePath) {
    await markModelInstalled(modelWithStoredSize, fileName, modelWithStoredSize.byteSize);
    return {model: modelWithStoredSize, fileName, filePath: installedFilePath};
  }

  return null;
};
