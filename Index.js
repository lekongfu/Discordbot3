const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Load configuration
let config;
try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (error) {
    logger.error('Failed to load config.json:', error.message);
    process.exit(1);
}

// Bot token from environment variables
const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;

if (!TOKEN) {
    logger.error('No Discord bot token found. Please set TOKEN or DISCORD_TOKEN environment variable.');
    process.exit(1);
}

// Initialize commands collection
client.commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

// Function to save configuration
function saveConfig() {
    try {
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        logger.error('Failed to save config:', error.message);
        return false;
    }
}

// Function to check if channel is enabled for reactions
function isChannelEnabled(channelId) {
    return config.enabledChannels.includes(channelId);
}

// Function to add channel to enabled list
function addChannel(channelId) {
    if (!config.enabledChannels.includes(channelId)) {
        config.enabledChannels.push(channelId);
        return saveConfig();
    }
    return true;
}

// Function to remove channel from enabled list
function removeChannel(channelId) {
    const index = config.enabledChannels.indexOf(channelId);
    if (index > -1) {
        config.enabledChannels.splice(index, 1);
        return saveConfig();
    }
    return true;
}

// Bot ready event
client.on('ready', () => {
    logger.info(`✅ Bot logged in as ${client.user.tag}`);
    logger.info(`🎯 Monitoring ${config.enabledChannels.length} channels for reactions`);
    
    // Set bot status
    client.user.setActivity('for W/L reactions', { type: 'WATCHING' });
});

// Message create event - main functionality
client.on('messageCreate', async (message) => {
    // Ignore bot messages (including self)
    if (message.author.bot) return;
    
    // Check if channel is enabled for reactions
    if (!isChannelEnabled(message.channel.id)) return;
    
    // Apply content filters if enabled
    if (config.contentFilters.enabled) {
        const content = message.content.toLowerCase();
        
        // Check for required keywords
        if (config.contentFilters.requiredKeywords.length > 0) {
            const hasRequiredKeyword = config.contentFilters.requiredKeywords.some(keyword => 
                content.includes(keyword.toLowerCase())
            );
            if (!hasRequiredKeyword) return;
        }
        
        // Check for excluded keywords
        if (config.contentFilters.excludedKeywords.length > 0) {
            const hasExcludedKeyword = config.contentFilters.excludedKeywords.some(keyword => 
                content.includes(keyword.toLowerCase())
            );
            if (hasExcludedKeyword) return;
        }
        
        // Check minimum message length
        if (content.length < config.contentFilters.minLength) return;
    }
    
    // Add reactions
    try {
        await message.react(config.reactions.winEmoji);
        await message.react(config.reactions.lossEmoji);
        
        logger.info(`✅ Added W/L reactions to message in #${message.channel.name} (${message.channel.id})`);
        
        // Update statistics
        config.statistics.totalReactions += 2;
        config.statistics.messagesProcessed += 1;
        config.statistics.lastReactionTime = new Date().toISOString();
        
        // Save stats every 10 reactions to avoid excessive file writes
        if (config.statistics.totalReactions % 10 === 0) {
            saveConfig();
        }
        
    } catch (error) {
        logger.error(`❌ Failed to add reactions to message in #${message.channel.name}:`, error.message);
        
        // Common error handling
        if (error.code === 10008) {
            logger.warn('Message was deleted before reactions could be added');
        } else if (error.code === 50013) {
            logger.error('Missing permissions to add reactions in this channel');
        } else if (error.code === 30010) {
            logger.warn('Maximum number of reactions reached on this message');
        }
        
        config.statistics.failedReactions += 1;
    }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
        logger.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }
    
    try {
        await command.execute(interaction, { config, addChannel, removeChannel, isChannelEnabled });
    } catch (error) {
        logger.error('Error executing command:', error);
        
        const errorMessage = 'There was an error while executing this command!';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// Error handling
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    saveConfig();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    saveConfig();
    client.destroy();
    process.exit(0);
});

// Login to Discord
client.login(TOKEN).catch(error => {
    logger.error('Failed to login to Discord:', error.message);
    process.exit(1);
});

// Export for potential testing
module.exports = { client, config, addChannel, removeChannel, isChannelEnabled };
