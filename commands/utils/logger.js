const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = 2; // Default to info level
        this.logFile = path.join(__dirname, '..', 'bot.log');
        
        // Ensure log file exists
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, '');
        }
    }
    
    setLevel(level) {
        if (level in this.logLevels) {
            this.currentLevel = this.logLevels[level];
        }
    }
    
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ') : '';
        
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
    }
    
    writeToFile(formattedMessage) {
        try {
            fs.appendFileSync(this.logFile, formattedMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }
    
    log(level, message, ...args) {
        if (this.logLevels[level] <= this.currentLevel) {
            const formattedMessage = this.formatMessage(level, message, ...args);
            
            // Console output with colors
            switch (level) {
                case 'error':
                    console.error('\x1b[31m%s\x1b[0m', formattedMessage);
                    break;
                case 'warn':
                    console.warn('\x1b[33m%s\x1b[0m', formattedMessage);
                    break;
                case 'info':
                    console.info('\x1b[36m%s\x1b[0m', formattedMessage);
                    break;
                case 'debug':
                    console.debug('\x1b[37m%s\x1b[0m', formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
            
            // Write to file
            this.writeToFile(formattedMessage);
        }
    }
    
    error(message, ...args) {
        this.log('error', message, ...args);
    }
    
    warn(message, ...args) {
        this.log('warn', message, ...args);
    }
    
    info(message, ...args) {
        this.log('info', message, ...args);
    }
    
    debug(message, ...args) {
        this.log('debug', message, ...args);
    }
    
    // Clear log file
    clearLogs() {
        try {
            fs.writeFileSync(this.logFile, '');
            this.info('Log file cleared');
        } catch (error) {
            this.error('Failed to clear log file:', error.message);
        }
    }
    
    // Get recent logs
    getRecentLogs(lines = 50) {
        try {
            const logContent = fs.readFileSync(this.logFile, 'utf8');
            const logLines = logContent.split('\n').filter(line => line.trim());
            return logLines.slice(-lines).join('\n');
        } catch (error) {
            this.error('Failed to read log file:', error.message);
            return 'Error reading logs';
        }
    }
}

// Export singleton instance
module.exports = new Logger();
