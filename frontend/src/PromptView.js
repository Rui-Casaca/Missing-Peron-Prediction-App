import React from 'react';

export default function PromptView({ prompt }) {
  return (
    <div>
      <h2>Prompt Gerado para LLM</h2>
      <pre>{prompt}</pre>
    </div>
  );
}
