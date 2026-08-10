import {NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {directories, getExistingDownloadTasks} from '@kesha-antonov/react-native-background-downloader';
import {
  findCatalogModel,
  getModelTaskId,
  ModelCatalogItem,
} from '../data/modelCatalog';
import {
  VISION_MODEL_CATALOG,
  getVisionModelDownloadUrl,
  getVisionModelMmprojDownloadUrl,
  VisionModelCatalogItem,
} from '../data/visionModelCatalog';

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
  copyContentUriToCache?: (uri: string, fileName: string) => Promise<string>;
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

/**
 * llama.cpp consumes filesystem paths, while Android's photo picker often
 * returns a content:// URI. Materialize those URIs in the app cache before
 * sending them to the multimodal runtime.
 */
export const getVisionImageFilePath = async (uri: string, fileName: string) => {
  const normalizedUri = uri.replace(/^file:\/\//, '');
  if (!uri.startsWith('content://')) {
    return normalizedUri;
  }

  if (!modelFileModule?.copyContentUriToCache) {
    throw new Error('This build cannot read Android content URIs for vision. Rebuild the app with the vision file module.');
  }

  return modelFileModule.copyContentUriToCache(uri, fileName);
};

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
  // A valid GGUF header only confirms that a download started. The old 50 MB
  // cap incorrectly promoted large, interrupted model downloads as installed.
  // Keep a small tolerance for repository-side byte-count changes, but require
  // virtually the entire expected file before loading it.
  const minimumCompleteSize = model.byteSize > 0
    ? Math.floor(model.byteSize * 0.95)
    : 10 * 1024 * 1024;
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

/**
 * Returns true when the vision model's main GGUF is fully downloaded.
 * Use {@link isVisionModelFullyInstalled} when you also need the mmproj file.
 */
export const isMainVisionFileInstalled = async (
  model: Pick<VisionModelCatalogItem, 'byteSize'>,
  fileName: string,
) => {
  return Boolean(await getInstalledModelFilePath(model as any, fileName));
};

const isMmprojVisionFileInstalled = async (
  model: Pick<VisionModelCatalogItem, 'mmprojByteSize'>,
  fileName: string,
) => {
  // mmproj files are GGUF too, but use their own size threshold.
  return Boolean(
    await getInstalledModelFilePath(
      {byteSize: model.mmprojByteSize} as any,
      fileName,
    ),
  );
};

export const isVisionModelFullyInstalled = async (
  model: VisionModelCatalogItem,
): Promise<boolean> => {
  const main = await isMainVisionFileInstalled(model, model.fileName);
  const mmproj = await isMmprojVisionFileInstalled(model, model.mmprojFileName);
  return main && mmproj;
};

export const getSelectedInstalledVisionModel = async () => {
  const [
    selectedId,
    selectedName,
    selectedFileName,
    selectedSizeBytes,
    downloadComplete,
  ] = await Promise.all([
    AsyncStorage.getItem('selectedVisionModelId'),
    AsyncStorage.getItem('selectedVisionModelName'),
    AsyncStorage.getItem('selectedVisionModelFileName'),
    AsyncStorage.getItem('selectedVisionModelSizeBytes'),
    AsyncStorage.getItem('visionModelDownloadComplete'),
  ]);

  if (selectedFileName) {
    const catalog = findVisionCatalogModelById(selectedId) || VISION_MODEL_CATALOG[0];
    const mainPath = await getInstalledModelFilePath(catalog, selectedFileName);
    const mmprojPath = await getInstalledModelFilePath(
      {byteSize: catalog.mmprojByteSize} as any,
      catalog.mmprojFileName,
    );
    // A Qwen2-VL package is usable only with both its language GGUF and
    // projector GGUF. Never promote a stale AsyncStorage flag to installed.
    const fullyInstalled = Boolean(mainPath && mmprojPath);

    if (fullyInstalled) {
      if (downloadComplete !== 'true') {
        await AsyncStorage.setItem('visionModelDownloadComplete', 'true');
      }
      return {
        id: selectedId || catalog.id,
        name: selectedName || catalog.name,
        fileName: selectedFileName,
        mmprojFileName: catalog.mmprojFileName,
        sizeBytes: Number(selectedSizeBytes || catalog.byteSize),
        mmprojSizeBytes: catalog.mmprojByteSize,
        isInstalled: true,
        filePath: mainPath || getModelFilePath(selectedFileName),
        mmprojPath: mmprojPath || getModelFilePath(catalog.mmprojFileName),
      };
    }

    // The app may have been interrupted after the main file download. Clear
    // the stale flag so the downloader resumes at the missing file instead of
    // letting ChatScreen attempt an unusable vision context.
    if (downloadComplete === 'true') {
      await AsyncStorage.setItem('visionModelDownloadComplete', 'false');
    }
  }

  // Fallback: Scan VISION_MODEL_CATALOG to auto-detect any vision model on disk!
  for (const catModel of VISION_MODEL_CATALOG) {
    const mainPath = await getInstalledModelFilePath(catModel, catModel.fileName);
    const mmprojPath = await getInstalledModelFilePath(
      {byteSize: catModel.mmprojByteSize} as any,
      catModel.mmprojFileName,
    );
    if (mainPath && mmprojPath) {
      await Promise.all([
        AsyncStorage.setItem('selectedVisionModelId', catModel.id),
        AsyncStorage.setItem('selectedVisionModelName', catModel.name),
        AsyncStorage.setItem('selectedVisionModelFileName', catModel.fileName),
        AsyncStorage.setItem('selectedVisionModelSizeBytes', String(catModel.byteSize)),
        AsyncStorage.setItem('visionModelDownloadComplete', 'true'),
      ]);

      return {
        id: catModel.id,
        name: catModel.name,
        fileName: catModel.fileName,
        mmprojFileName: catModel.mmprojFileName,
        sizeBytes: catModel.byteSize,
        mmprojSizeBytes: catModel.mmprojByteSize,
        isInstalled: true,
        filePath: mainPath,
        mmprojPath: mmprojPath || getModelFilePath(catModel.mmprojFileName),
      };
    }
  }

  return null;
};

const findVisionCatalogModelById = (id?: string | null) =>
  VISION_MODEL_CATALOG.find(m => m.id === id) ?? null;

export const hasInstalledVisionModel = async (): Promise<boolean> => {
  const visionModel = await getSelectedInstalledVisionModel();
  return Boolean(visionModel && visionModel.isInstalled);
};

/**
 * The single auto-installed vision model (SmolVLM 256M Instruct + f16 mmproj).
 * Kept in sync with VISION_MODEL_CATALOG[0].
 */
export const DEFAULT_VISION_MODEL = VISION_MODEL_CATALOG[0];
export const QWEN_VISION_MODEL = DEFAULT_VISION_MODEL;

/**
 * Seed AsyncStorage with the Qwen2-VL vision model selection so DownloadScreen
 * picks it up and starts downloading the main + mmproj GGUFs immediately.
 *
 * Sets the same keys the legacy VisionModelPage selection wrote, plus the
 * isVisionDownload flag DownloadScreen looks for.
 */
export const seedVisionDownload = async () => {
  const model = QWEN_VISION_MODEL;
  await AsyncStorage.multiSet([
    ['selectedVisionModelId', model.id],
    ['selectedVisionModelName', model.name],
    ['selectedVisionModelFileName', model.fileName],
    ['selectedVisionModelSizeBytes', String(model.byteSize)],
    ['selectedVisionModelMmprojFileName', model.mmprojFileName],
    ['selectedVisionModelMmprojSizeBytes', String(model.mmprojByteSize)],
    ['selectedVisionModelDownloadUrl', getVisionModelDownloadUrl(model)],
    ['selectedVisionModelMmprojDownloadUrl', getVisionModelMmprojDownloadUrl(model)],
    ['isVisionDownload', 'true'],
    ['isDownloadPaused', 'false'],
  ]);
};
