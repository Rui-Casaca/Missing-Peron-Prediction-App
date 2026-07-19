const fs = require('fs');
const path = require('path');

class DebugLogger {
  constructor() {
    this.logFile = path.join(__dirname, 'debug.log');
    this.logToConsole = true;
    this.logToFile = true;
    
    // Limpar log anterior no início
    this.clearLog();
    this.log('=== DEBUG LOGGER INICIADO ===');
    this.log(`Timestamp: ${new Date().toISOString()}`);
    this.log(`Arquivo de log: ${this.logFile}`);
  }

  clearLog() {
    if (this.logToFile) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      formatted += `\nDATA: ${JSON.stringify(data, null, 2)}`;
    }
    
    return formatted + '\n';
  }

  log(message, data = null) {
    const formatted = this.formatMessage('INFO', message, data);
    
    if (this.logToConsole) {
      console.log(`🔍 ${message}`);
      if (data) console.log(data);
    }
    
    if (this.logToFile) {
      fs.appendFileSync(this.logFile, formatted);
    }
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    } : null;
    
    const formatted = this.formatMessage('ERROR', message, errorData);
    
    if (this.logToConsole) {
      console.error(`❌ ${message}`);
      if (error) console.error(error);
    }
    
    if (this.logToFile) {
      fs.appendFileSync(this.logFile, formatted);
    }
  }

  warn(message, data = null) {
    const formatted = this.formatMessage('WARN', message, data);
    
    if (this.logToConsole) {
      console.warn(`⚠️ ${message}`);
      if (data) console.warn(data);
    }
    
    if (this.logToFile) {
      fs.appendFileSync(this.logFile, formatted);
    }
  }

  success(message, data = null) {
    const formatted = this.formatMessage('SUCCESS', message, data);
    
    if (this.logToConsole) {
      console.log(`✅ ${message}`);
      if (data) console.log(data);
    }
    
    if (this.logToFile) {
      fs.appendFileSync(this.logFile, formatted);
    }
  }

  debug(message, data = null) {
    const formatted = this.formatMessage('DEBUG', message, data);
    
    if (this.logToConsole) {
      console.log(`🐛 ${message}`);
      if (data) console.log(data);
    }
    
    if (this.logToFile) {
      fs.appendFileSync(this.logFile, formatted);
    }
  }

  section(title) {
    const separator = '='.repeat(50);
    const formatted = `\n${separator}\n${title.toUpperCase()}\n${separator}\n`;
    
    if (this.logToConsole) {
      console.log(`\n🎯 ${title}`);
    }
    
    if (this.logToFile) {
      fs.appendFileSync(this.logFile, formatted);
    }
  }

  getLogContent() {
    if (fs.existsSync(this.logFile)) {
      return fs.readFileSync(this.logFile, 'utf8');
    }
    return 'Log file not found';
  }
}

module.exports = { DebugLogger };