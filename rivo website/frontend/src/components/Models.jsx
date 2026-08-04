import React from 'react';
import { Cpu, CheckCircle } from 'lucide-react';

const Models = () => {
  const models = [
    { name: 'Qwen 2.5 0.5B', file: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf', ram: 'Any RAM', size: '0.40 GB', tag: 'Fastest' },
    { name: 'Llama 3.2 1B', file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', ram: '2 GB RAM', size: '0.81 GB', tag: 'Recommended' },
    { name: 'Qwen 2.5 Coder 1.5B', file: 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf', ram: '2 GB RAM', size: '0.99 GB', tag: 'Coding Specialist' },
    { name: 'DeepSeek R1 Distill 1.5B', file: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf', ram: '2 GB RAM', size: '1.12 GB', tag: 'Reasoning' },
    { name: 'SmolLM2 1.7B', file: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf', ram: '2 GB RAM', size: '1.06 GB', tag: 'Compact' },
    { name: 'Gemma 2B', file: 'gemma-2-2b-it-IQ3_M.gguf', ram: '3 GB RAM', size: '1.39 GB', tag: 'Heavy' },
    { name: 'Qwen 2.5 3B', file: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf', ram: '4 GB RAM', size: '1.93 GB', tag: 'Pro' },
    { name: 'Llama 3.2 3B', file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', ram: '4 GB RAM', size: '2.02 GB', tag: 'Pro' },
    { name: 'Phi 3.5 Mini', file: 'Phi-3.5-mini-instruct-Q4_K_M.gguf', ram: '6 GB RAM', size: '2.39 GB', tag: 'Heavy Pro' },
    { name: 'Mistral 7B', file: 'mistral-7b-instruct-v0.2.Q3_K_L.gguf', ram: '6 GB RAM', size: '3.82 GB', tag: 'Desktop Grade' },
    { name: 'Llama 3 8B', file: 'Meta-Llama-3-8B-Instruct.Q3_K_L.gguf', ram: '8 GB RAM', size: '4.32 GB', tag: 'Max Power' }
  ];

  return (
    <section id="models" className="models-section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Supported Model Catalog</h2>
          <p className="section-subtitle">
            Rivo supports standard quantized GGUF weights. Your hardware specs are dynamically mapped to recommend the most optimal model.
          </p>
        </div>
        <div className="table-responsive">
          <table className="models-table">
            <thead>
              <tr>
                <th>Model Name</th>
                <th>Quantized File</th>
                <th>Required RAM</th>
                <th>Approx. Size</th>
                <th>Focus State</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model, idx) => (
                <tr key={idx} className={model.tag === 'Recommended' ? 'highlight-row' : ''}>
                  <td className="model-name-cell">
                    <div className="model-name-content">
                      <Cpu size={16} className="table-icon" />
                      <span>{model.name}</span>
                    </div>
                  </td>
                  <td className="file-cell"><code>{model.file}</code></td>
                  <td><span className="ram-badge">{model.ram}</span></td>
                  <td className="size-cell">{model.size}</td>
                  <td>
                    {model.tag === 'Recommended' ? (
                      <span className="recommended-tag">
                        <CheckCircle size={12} strokeWidth={2.5} />
                        <span>Recommended</span>
                      </span>
                    ) : (
                      <span className="catalog-tag">{model.tag}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default Models;
