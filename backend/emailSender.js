const nodemailer = require('nodemailer');
require('dotenv').config();

function buildDefaultHtml() {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #317f36; text-align: center;">
        SARIA - Search And Rescue Intelligent Analysis
      </h2>
      <h3 style="color: #317f36; text-align: center;">
        Relatório de Análise e Previsão - Pessoa Desaparecida
      </h3>
      
      <div style="background-color: #f0f8ff; padding: 20px; border-left: 4px solid #317f36; margin: 20px 0;">
        <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-PT')}</p>
        <p><strong>Sistema:</strong> Análise de Previsão Automatizada</p>
        <p><strong>Status:</strong> Relatório Gerado Automaticamente</p>
      </div>

      <p>Foi gerado um novo relatório de análise de previsão para um caso de pessoa desaparecida.</p>

      <p><strong>O relatório em anexo contém:</strong></p>
      <ul>
        <li>Dados completos da ocorrência</li>
        <li>Análise de previsão de localização</li>
        <li>Recomendações operacionais</li>
        <li>Avaliação de risco e prioridade</li>
      </ul>

      <div style="background-color: #ffe4e1; padding: 15px; border: 1px solid #ff6b6b; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 0; color: #d32f2f;"><strong>⚠️ ATENÇÃO:</strong> Este relatório contém informações sensíveis e deve ser tratado com confidencialidade adequada.</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
      <p style="font-size: 12px; color: #666; text-align: center;">
        Sistema Automático - SARIA<br>
        Este email foi gerado automaticamente. Não responder.
      </p>
    </div>
  `;
}

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Configurações de email não definidas no ficheiro .env');
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 465,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });
}

/**
 * Envia email genérico com attachments. attachments é um array de objetos compatíveis com nodemailer
 * { filename, content, contentType }
 */
async function sendEmailWithAttachments(destinatarios, attachments = [], options = {}) {
  const subject = options.subject || `Relatório Urgente - Pessoa Desaparecida (${new Date().toLocaleDateString('pt-PT')})`;
  const html = options.html || buildDefaultHtml();

  const transporter = createTransporter();
  await transporter.verify();
  console.log('✅ Servidor de email conectado');

  const mailOptions = {
    from: `"SARIA - Sistema Análise e Previsão" <${process.env.SMTP_USER}>`,
    to: Array.isArray(destinatarios) ? destinatarios.join(', ') : destinatarios,
    subject,
    html,
    attachments: attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
  };

  const info = await transporter.sendMail(mailOptions);
    // nodemailer pode expor accepted/rejected e envelope
    const result = {
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      envelope: info.envelope || null,
      response: info.response || null
    };
    console.log('✅ Email enviado:', result.messageId);
    console.log('📧 Destinatários (accepted):', result.accepted.join(', '));
    if (result.rejected && result.rejected.length) console.warn('⚠️ Destinatários rejeitados:', result.rejected.join(', '));
    return { sucesso: true, result };
}

// Compatibilidade: função original que aceitava um pdfBuffer continua a existir
async function sendEmail(destinatarios, pdfBuffer) {
  const attachments = [
    {
      filename: `relatorio-desaparecimento-${new Date().toISOString().split('T')[0]}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }
  ];
  return sendEmailWithAttachments(destinatarios, attachments);
}

module.exports = { sendEmail, sendEmailWithAttachments };
