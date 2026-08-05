export type ModelCatalogItem = {
  id: string;
  name: string;
  logo: any;
  desc: string;
  limitations: string;
  fileName: string;
  byteSize: number;
  minRam: number;
  priority: number;
};

const LOCAL_LOGOS: Record<string, any> = {
  'https://github.com/huggingface.png': require('../assets/models/huggingface.png'),
  'https://github.com/QwenLM.png': require('../assets/models/qwen.png'),
  'https://github.com/meta-llama.png': require('../assets/models/meta.png'),
  'https://github.com/deepseek-ai.png': require('../assets/models/deepseek.png'),
  'https://github.com/google.png': require('../assets/models/google.png'),
  'https://github.com/microsoft.png': require('../assets/models/microsoft.png'),
  'https://github.com/mistralai.png': require('../assets/models/mistral.png'),
};

export const renderModelLogoSource = (logo: any) => {
  if (!logo) return null;
  if (typeof logo === 'string' && LOCAL_LOGOS[logo]) {
    return LOCAL_LOGOS[logo];
  }
  if (typeof logo === 'string') {
    return { uri: logo };
  }
  return logo;
};

export const MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: 'bartowski/SmolLM2-360M-Instruct-GGUF',
    name: 'SmolLM2 360M',
    logo: require('../assets/models/huggingface.png'),
    desc: 'Featherlight fast chat for low-memory phones.',
    limitations: 'Good for simple greetings & basic QA, but lacks deep reasoning or coding skills.',
    fileName: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    byteSize: 270590880,
    minRam: 0,
    priority: 8,
  },
  {
    id: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF',
    name: 'Qwen 2.5 0.5B',
    logo: require('../assets/models/qwen.png'),
    desc: 'Tiny, fast, and reliable on almost any phone.',
    limitations: 'Limited reasoning depth; best for short, direct questions.',
    fileName: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    byteSize: 397808192,
    minRam: 0,
    priority: 10,
  },

  {
    id: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    name: 'Llama 3.2 1B',
    logo: require('../assets/models/meta.png'),
    desc: 'Compact general chat model with strong mobile speed.',
    limitations: 'Great for quick chat & summarizing, but limited on heavy logic or long coding.',
    fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    byteSize: 807694464,
    minRam: 2,
    priority: 20,
  },
  {
    id: 'bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    name: 'Qwen 2.5 Coder 1.5B',
    logo: require('../assets/models/qwen.png'),
    desc: 'Specialized mobile coding & technical knowledge expert.',
    limitations: 'Focused primarily on programming; average for general creative writing.',
    fileName: 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',
    byteSize: 986048800,
    minRam: 2,
    priority: 28,
  },
  {
    id: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF',
    name: 'Qwen 2.5 1.5B',
    logo: require('../assets/models/qwen.png'),
    desc: 'Best small-model balance for chat, coding, and speed.',
    limitations: 'Balanced daily driver; complex multi-step math may occasionally fail.',
    fileName: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    byteSize: 986048768,
    minRam: 2,
    priority: 30,
  },
  {
    id: 'bartowski/SmolLM2-1.7B-Instruct-GGUF',
    name: 'SmolLM2 1.7B',
    logo: require('../assets/models/huggingface.png'),
    desc: 'Ultra-responsive chat expert with high accuracy and speed.',
    limitations: 'Great conversational flow, but moderate technical & deep reasoning knowledge.',
    fileName: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    byteSize: 1055609824,
    minRam: 2,
    priority: 32,
  },
  {
    id: 'bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
    name: 'DeepSeek R1 1.5B',
    logo: require('../assets/models/deepseek.png'),
    desc: 'State-of-the-art mobile reasoning and smooth conversational AI.',
    limitations: 'Takes slightly longer to process initial reasoning thoughts before outputting.',
    fileName: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    byteSize: 1117320800,
    minRam: 2,
    priority: 35,
  },
  {
    id: 'bartowski/gemma-2-2b-it-GGUF',
    name: 'Gemma 2B',
    logo: require('../assets/models/google.png'),
    desc: 'Lightning fast. Optimized for low memory footprint.',
    limitations: 'Strict Google safety guardrails; moderate depth on niche academic topics.',
    fileName: 'gemma-2-2b-it-IQ3_M.gguf',
    byteSize: 1393561440,
    minRam: 3,
    priority: 40,
  },
  {
    id: 'bartowski/Qwen2.5-Coder-3B-Instruct-GGUF',
    name: 'Qwen 2.5 Coder 3B',
    logo: require('../assets/models/qwen.png'),
    desc: 'Powerful mobile coding and software engineering expert.',
    limitations: 'Requires 4GB+ RAM. Technical coding focus rather than casual conversation.',
    fileName: 'Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf',
    byteSize: 1929903360,
    minRam: 4,
    priority: 48,
  },
  {
    id: 'bartowski/Qwen2.5-3B-Instruct-GGUF',
    name: 'Qwen 2.5 3B',
    logo: require('../assets/models/qwen.png'),
    desc: 'Stronger reasoning while still practical on midrange devices.',
    limitations: 'Requires 4GB+ RAM; higher battery usage during continuous generation.',
    fileName: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    byteSize: 1929903264,
    minRam: 4,
    priority: 50,
  },
  {
    id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    name: 'Llama 3.2 3B',
    logo: require('../assets/models/meta.png'),
    desc: 'Capable compact model for richer offline conversations.',
    limitations: 'Requires 4GB+ RAM; slower speed on older 2GB/3GB processors.',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    byteSize: 2019377696,
    minRam: 4,
    priority: 60,
  },
  {
    id: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    name: 'Phi 3.5 Mini',
    logo: require('../assets/models/microsoft.png'),
    desc: 'Great compact coding and reasoning model.',
    limitations: 'Requires 6GB+ RAM; strict prompt structure required for best output.',
    fileName: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    byteSize: 2393232672,
    minRam: 6,
    priority: 70,
  },
  {
    id: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF',
    name: 'Mistral 7B',
    logo: require('../assets/models/mistral.png'),
    desc: 'Balanced performance and general knowledge.',
    limitations: 'Requires 6GB+ RAM & fast storage; heavy battery & memory usage.',
    fileName: 'mistral-7b-instruct-v0.2.Q3_K_L.gguf',
    byteSize: 3822024992,
    minRam: 6,
    priority: 80,
  },
  {
    id: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
    name: 'Qwen 2.5 7B',
    logo: require('../assets/models/qwen.png'),
    desc: 'World-class high knowledge, science, math, and reasoning expert.',
    limitations: 'Requires 6GB+ RAM; slower response time on non-flagship chipsets.',
    fileName: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    byteSize: 4683074240,
    minRam: 6,
    priority: 85,
  },
  {
    id: 'bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF',
    name: 'DeepSeek R1 8B',
    logo: require('../assets/models/deepseek.png'),
    desc: 'Deep reasoning SOTA powerhouse for complex knowledge tasks.',
    limitations: 'Requires 8GB+ RAM; heavy processing load with longer initial think time.',
    fileName: 'DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
    byteSize: 4920736608,
    minRam: 8,
    priority: 88,
  },
  {
    id: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    name: 'Llama 3.1 8B',
    logo: require('../assets/models/meta.png'),
    desc: 'Meta flagship high-knowledge model for complex intelligence.',
    limitations: 'Requires 8GB+ RAM; heavy download (~4.9GB) & high memory consumption.',
    fileName: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    byteSize: 4920739232,
    minRam: 8,
    priority: 90,
  },
  {
    id: 'bartowski/gemma-2-9b-it-GGUF',
    name: 'Gemma 2 9B',
    logo: require('../assets/models/google.png'),
    desc: 'Google flagship open knowledge & deep reasoning engine.',
    limitations: 'Requires 8GB+ RAM; largest download size (~5.7GB).',
    fileName: 'gemma-2-9b-it-Q4_K_M.gguf',
    byteSize: 5761057728,
    minRam: 8,
    priority: 95,
  },
];

export const getModelDownloadUrl = (model: ModelCatalogItem) =>
  `https://huggingface.co/${model.id}/resolve/main/${encodeURIComponent(model.fileName)}`;

export const getModelTaskId = (model: Pick<ModelCatalogItem, 'id' | 'fileName'>) =>
  `model_dl_${model.id}_${model.fileName}`.replace(/[^a-zA-Z0-9]/g, '_');

export const formatModelSize = (bytes: number) =>
  `${(bytes / 1000 / 1000 / 1000).toFixed(2)} GB`;

export const findCatalogModel = (modelId?: string | null, modelName?: string | null) =>
  MODEL_CATALOG.find(model => model.id === modelId || model.name === modelName) ?? MODEL_CATALOG[0];

export const getRequiredStorageGB = (bytes: number) =>
  bytes / 1000 / 1000 / 1000 + 1;

