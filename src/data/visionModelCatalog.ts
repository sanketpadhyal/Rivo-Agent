/**
 * Vision Model Catalog — the single auto-installed multimodal vision-language model.
 *
 * SmolVLM-256M-Instruct (Q8_0 + f16 mmproj) by Hugging Face / ggml-org is the recommended vision model for Rivo:
 *   - Extremely compact (~365 MB total download vs 2.32 GB).
 *   - Hyper-smooth performance using only ~1 GB RAM.
 *   - Fast OCR, image understanding, and visual QA running locally on llama.cpp.
 */

export type VisionModelCatalogItem = {
  id: string;
  name: string;
  desc: string;
  logo?: any;
  fileName: string;
  byteSize: number;
  mmprojFileName: string;
  mmprojByteSize: number;
  minRam: number;
};

export const VISION_MODEL_CATALOG: VisionModelCatalogItem[] = [
  {
    id: 'ggml-org/SmolVLM-256M-Instruct-GGUF',
    name: 'SmolVLM 256M Instruct',
    desc:
      'Ultra-compact Hugging Face SmolVLM-256M vision-language model built for instant image understanding with minimal RAM — runs locally on llama.cpp.',
    logo: require('../assets/models/huggingface.png'),
    fileName: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    byteSize: 175054528,
    mmprojFileName: 'mmproj-SmolVLM-256M-Instruct-f16.gguf',
    mmprojByteSize: 190031616,
    minRam: 1,
  },
];

export const getVisionModelDownloadUrl = (model: VisionModelCatalogItem) =>
  `https://huggingface.co/${model.id}/resolve/main/${encodeURIComponent(model.fileName)}`;

export const getVisionModelMmprojDownloadUrl = (model: VisionModelCatalogItem) =>
  `https://huggingface.co/${model.id}/resolve/main/${encodeURIComponent(model.mmprojFileName)}`;

export const formatVisionModelSize = (bytes: number) => {
  if (bytes < 1000 * 1000 * 1000) {
    return `${Math.round(bytes / (1000 * 1000))} MB`;
  }
  return `${(bytes / 1000 / 1000 / 1000).toFixed(2)} GB`;
};

export const findVisionCatalogModel = (modelId?: string | null) =>
  VISION_MODEL_CATALOG.find(model => model.id === modelId) ?? null;