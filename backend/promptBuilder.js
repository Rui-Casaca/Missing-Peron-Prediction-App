

const promptBuilderOficial = require('./promptBuilderOficial');

// Função principal: sempre usa o builder oficial

function buildPrompt(csvData) {
  return promptBuilderOficial.buildPrompt(csvData);
}

module.exports = {
  ...promptBuilderOficial,
  buildPrompt
};
