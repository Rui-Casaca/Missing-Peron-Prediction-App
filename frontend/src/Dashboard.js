import React from 'react';

function Dashboard({ stats, systemStatus, ultimoCaso, casos, onRefresh }) {
  
  const handleRefresh = async () => {
    if (onRefresh) {
      await onRefresh();
    }
  };

  return (
    <div className="cards-grid">
      <div className="card">
        <h3>Estatísticas Gerais</h3>
        <div className="estatisticas">
          <div className="stat">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total de Casos</span>
          </div>
          <div className="stat">
            <span className="stat-number">{stats.ultimos30}</span>
            <span className="stat-label">Últimos 30 Dias</span>
          </div>
        </div>
        <button 
          onClick={handleRefresh} 
          style={{
            marginTop: '10px',
            padding: '5px 10px',
            backgroundColor: '#1B5E20',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          🔄 Actualizar
        </button>
      </div>

      <div className="card">
        <h3>Por Nível de Risco</h3>
        <div className="estatisticas-risco">
          <div className="risk-item risk-normal">
            <span>{stats.riscoNormal}</span> Normal
          </div>
          <div className="risk-item risk-moderado">
            <span>{stats.riscoModerado}</span> Moderado
          </div>
          <div className="risk-item risk-elevado">
            <span>{stats.riscoElevado}</span> Elevado
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Tipos de Desaparecimento</h3>
        <div className="tipos-container">
          {(() => {
            // preferir stats.por_tipo se disponível
            const porTipo = stats?.por_tipo || (casos && casos.length ? casos.reduce((acc, c) => { const t = c.Tipo_Desaparecimento || c.Tipo_Desaparecimento_Oficial || 'Desconhecido'; acc[t] = (acc[t]||0)+1; return acc; }, {}) : {});
            const entries = Object.entries(porTipo || {});
            if (!entries || entries.length === 0) return <p>Nenhum dado</p>;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {entries.map(([tipo, count]) => (
                  <div key={tipo} style={{ padding: 8, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                    <strong style={{ display:'block', fontSize: 14 }}>{tipo}</strong>
                    <span style={{ color: '#333', fontSize: 18 }}>{count}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <h3>Último Caso</h3>
        <div className="ultimo-caso">
          <p>{ultimoCaso}</p>
        </div>
      </div>

      <div className="card casos-lista">
        <h3>Lista de Casos</h3>
        <div className="casos-container">
          {casos && casos.length > 0 ? (
            <div className="casos-tabela">
              <div className="casos-header">
                <div>ID</div>
                <div>Nome</div>
                <div>Idade</div>
                <div>Data</div>
                <div>Risco</div>
                <div>Prioridade</div>
              </div>
              {casos.map((caso, index) => (
                <div key={index} className={`caso-linha risco-${caso.Risco_Calculado?.toLowerCase() || 'normal'}`}>
                  <div>{caso.ID_Caso || (index + 1)}</div>
                  <div>{caso.Nome_Completo || 'N/D'}</div>
                  <div>{caso.Idade_Exacta || 'N/D'}</div>
                  <div>{caso.Data_Desaparecimento || 'N/D'}</div>
                  <div className={`risco-badge risco-${caso.Risco_Calculado?.toLowerCase() || 'normal'}`}>
                    {caso.Risco_Calculado || 'N/D'}
                  </div>
                  <div className={`prioridade-badge prioridade-${caso.Avaliacao_Prioridade?.toLowerCase().replace(/\s+/g, '-') || 'rotina'}`}>
                    {caso.Avaliacao_Prioridade || 'N/D'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
              Nenhum caso encontrado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

