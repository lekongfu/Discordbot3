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
    
    // Update statistics
    config.statistics.botStartTime = new Date().toISOString();
    saveConfig();
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
        // Add win emoji
        await message.react(config.reactions.winEmoji);
        
        // Optional delay between reactions
        if (config.reactions.delayBetweenReactions > 0) {
            await new Promise(resolve => setTimeout(resolve, config.reactions.delayBetweenReactions));
        }
        
        // Add loss emoji
        await message.react(config.reactions.lossEmoji);
        
        // Update statistics
        config.statistics.totalReactions += 2;
        config.statistics.messagesProcessed += 1;
        config.statistics.lastReactionTime = new Date().toISOString();
        
        // Auto-save if enabled
        if (config.settings.autoSaveConfig) {
            saveConfig();
        }
        
        logger.info(`Added W/L reactions to message in ${message.channel.name} by ${message.author.tag}`);
        
    } catch (error) {
        config.statistics.failedReactions += 1;
        logger.error(`Failed to add reactions: ${error.message}`);
        
        // Handle rate limiting
        if (error.code === 50013) {
            logger.warn('Missing permissions to add reactions');
        } else if (error.code === 429) {
            logger.warn('Rate limited - reactions temporarily disabled');
        }
    }
});

// Interaction create event - handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction, { 
            config, 
            addChannel, 
            removeChannel, 
            isChannelEnabled 
        });
    } catch (error) {
        logger.error(`Error executing command ${interaction.commandName}:`, error);
        
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

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

// Login to Discord
client.login(TOKEN);
