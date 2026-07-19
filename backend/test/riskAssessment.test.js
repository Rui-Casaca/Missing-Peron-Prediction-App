const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularRiscoOficial,
  determinarPrioridadeOficial
} = require('../riskAssessment');

test('classifica caso sem indicadores como Normal e Rotina', () => {
  const avaliacao = calcularRiscoOficial({ Idade_Exacta: '35' });
  const prioridade = determinarPrioridadeOficial(avaliacao.nivel, { Idade_Exacta: '35' });

  assert.equal(avaliacao.nivel, 'Normal');
  assert.equal(avaliacao.pontuacao, 0);
  assert.equal(prioridade, 'Rotina');
});

test('classifica indícios de crime como Elevado e Muito Urgente', () => {
  const dados = { Idade_Exacta: '42', Indicios_Crime: 'Sim' };
  const avaliacao = calcularRiscoOficial(dados);
  const prioridade = determinarPrioridadeOficial(avaliacao.nivel, dados);

  assert.equal(avaliacao.nivel, 'Elevado');
  assert.equal(prioridade, 'Muito Urgente');
  assert.ok(avaliacao.indicadores.some(indicador => indicador.codigo === 'INDICIOS_CRIME'));
});

test('menor de idade ativa indicador e prioridade Muito Urgente', () => {
  const dados = { Idade_Exacta: '12' };
  const avaliacao = calcularRiscoOficial(dados);
  const prioridade = determinarPrioridadeOficial(avaliacao.nivel, dados);

  assert.equal(avaliacao.nivel, 'Moderado');
  assert.equal(prioridade, 'Muito Urgente');
  assert.ok(avaliacao.indicadores.some(indicador => indicador.codigo === 'MENOR_IDADE'));
});

test('medicação vital sem transporte gera risco Moderado e prioridade Urgente', () => {
  const dados = {
    Idade_Exacta: '68',
    Medicamentos_Vitais_Necessarios: 'Sim',
    Transporta_Medicamentos: 'Não'
  };
  const avaliacao = calcularRiscoOficial(dados);
  const prioridade = determinarPrioridadeOficial(avaliacao.nivel, dados);

  assert.equal(avaliacao.nivel, 'Moderado');
  assert.equal(prioridade, 'Urgente');
  assert.ok(avaliacao.indicadores.some(indicador => indicador.codigo === 'CONDICOES_MEDICAS'));
});
