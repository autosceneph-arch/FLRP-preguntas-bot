require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = path.join(__dirname, 'data.json');
const PINK = 0xFF69B4;

// ===================== BASE DE DATOS =====================
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Error cargando data:', err);
    return {};
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error guardando data:', err);
  }
}

function getGuildData(guildId) {
  const data = loadData();
  if (!data[guildId]) {
    data[guildId] = {
      allowedRole: null,
      questions: []
    };
    saveData(data);
  }
  return data[guildId];
}

// ===================== EMBED ROSA =====================
function createPinkEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(PINK)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Florida Preguntas y Respuestas' })
    .setTimestamp();
}

function hasPermission(member, guildData) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (!guildData.allowedRole) return false;
  return member.roles.cache.has(guildData.allowedRole);
}

// ===================== COMANDOS =====================
const commands = [
  new SlashCommandBuilder()
    .setName('agregar-pregunta')
    .setDescription('Agrega una nueva pregunta/respuesta'),

  new SlashCommandBuilder()
    .setName('config-rol')
    .setDescription('Configura el rol que puede agregar preguntas')
    .addRoleOption(option =>
      option.setName('rol').setDescription('Rol permitido').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('lista-preguntas')
    .setDescription('Muestra todas las preguntas'),

  new SlashCommandBuilder()
    .setName('eliminar-pregunta')
    .setDescription('Elimina una pregunta por número')
    .addIntegerOption(option =>
      option.setName('numero').setDescription('Número de la pregunta').setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('pregunta')
    .setDescription('Usa una pregunta configurada')
    .addStringOption(option =>
      option.setName('comando').setDescription('Nombre del comando').setRequired(true)
    )
].map(c => c.toJSON());

// ===================== READY =====================
client.once('ready', async () => {
  console.log(`✅ Bot iniciado como ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registrados');
  } catch (error) {
    console.error(error);
  }

  client.user.setActivity('Florida Preguntas | /pregunta', { type: 3 });
});

// ===================== INTERACCIONES =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildData = getGuildData(interaction.guild.id);
  const { commandName, member } = interaction;

  // /agregar-pregunta
  if (commandName === 'agregar-pregunta') {
    if (!hasPermission(member, guildData)) {
      return interaction.reply({
        embeds: [createPinkEmbed('❌ Sin permiso', 'No tienes permiso para agregar preguntas.')],
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('modal-agregar')
      .setTitle('Agregar nueva pregunta');

    const keywordInput = new TextInputBuilder()
      .setCustomId('keyword')
      .setLabel('Palabra clave (activación automática)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ejemplo: papeles')
      .setRequired(true);

    const commandInput = new TextInputBuilder()
      .setCustomId('comando')
      .setLabel('Nombre del comando (sin /)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ejemplo: papeles')
      .setRequired(true);

    const responseInput = new TextInputBuilder()
      .setCustomId('respuesta')
      .setLabel('Respuesta del bot')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(keywordInput),
      new ActionRowBuilder().addComponents(commandInput),
      new ActionRowBuilder().addComponents(responseInput)
    );

    await interaction.showModal(modal);
  }

  // /config-rol
  else if (commandName === 'config-rol') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPinkEmbed('❌ Solo Administradores', 'Solo admins pueden usar este comando.')],
        ephemeral: true
      });
    }

    const role = interaction.options.getRole('rol');
    guildData.allowedRole = role.id;
    const data = loadData();
    data[interaction.guild.id] = guildData;
    saveData(data);

    await interaction.reply({
      embeds: [createPinkEmbed('✅ Rol configurado', `El rol **${role.name}** ahora puede agregar preguntas.`)]
    });
  }

  // /lista-preguntas
  else if (commandName === 'lista-preguntas') {
    if (guildData.questions.length === 0) {
      return interaction.reply({
        embeds: [createPinkEmbed('📋 Lista vacía', 'No hay preguntas configuradas.')]
      });
    }

    let desc = '';
    guildData.questions.forEach((q, i) => {
      desc += `**${i + 1}.** \`/${q.command}\`\n🔑 \`${q.keyword}\`\n💬 ${q.response.substring(0, 80)}...\n\n`;
    });

    await interaction.reply({
      embeds: [createPinkEmbed('📋 Lista de preguntas', desc)]
    });
  }

  // /eliminar-pregunta
  else if (commandName === 'eliminar-pregunta') {
    if (!hasPermission(member, guildData)) {
      return interaction.reply({
        embeds: [createPinkEmbed('❌ Sin permiso', 'No tienes permiso.')],
        ephemeral: true
      });
    }

    const index = interaction.options.getInteger('numero') - 1;
    if (index < 0 || index >= guildData.questions.length) {
      return interaction.reply({
        embeds: [createPinkEmbed('❌ Número inválido', 'Usa /lista-preguntas para ver los números.')],
        ephemeral: true
      });
    }

    const deleted = guildData.questions.splice(index, 1)[0];
    const data = loadData();
    data[interaction.guild.id] = guildData;
    saveData(data);

    await interaction.reply({
      embeds: [createPinkEmbed('🗑️ Eliminada', `Se eliminó \`/${deleted.command}\``)]
    });
  }

  // /pregunta
  else if (commandName === 'pregunta') {
    const comando = interaction.options.getString('comando').toLowerCase();
    const found = guildData.questions.find(q => q.command === comando);

    if (!found) {
      return interaction.reply({
        embeds: [createPinkEmbed('❌ No encontrado', `No existe \`/${comando}\``)],
        ephemeral: true
      });
    }

    await interaction.reply({
      embeds: [createPinkEmbed('💬 Respuesta', found.response)]
    });
  }
});

// ===================== MODAL =====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== 'modal-agregar') return;

  const keyword = interaction.fields.getTextInputValue('keyword').trim().toLowerCase();
  const comando = interaction.fields.getTextInputValue('comando').trim().toLowerCase().replace('/', '');
  const respuesta = interaction.fields.getTextInputValue('respuesta').trim();

  const guildData = getGuildData(interaction.guild.id);

  if (guildData.questions.some(q => q.command === comando)) {
    return interaction.reply({
      embeds: [createPinkEmbed('❌ Ya existe', `El comando \`/${comando}\` ya está registrado.`)],
      ephemeral: true
    });
  }

  guildData.questions.push({ keyword, command: comando, response: respuesta });

  const data = loadData();
  data[interaction.guild.id] = guildData;
  saveData(data);

  console.log(`[NUEVA PREGUNTA] Servidor: ${interaction.guild.name} | Keyword: ${keyword} | Comando: ${comando}`);

  await interaction.reply({
    embeds: [createPinkEmbed('✅ Pregunta pene correctamente',
      `**Palabra clave:** ${keyword}\n**Comando:** \`/${comando}\`\n**Respuesta:**\n${respuesta}`
    )]
  });
});

// ===================== DETECCIÓN DE PALABRAS CLAVE (MEJORADA) =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildData = getGuildData(message.guild.id);
  if (!guildData.questions || guildData.questions.length === 0) return;

  const content = message.content.toLowerCase();

  for (const q of guildData.questions) {
    if (!q.keyword) continue;

    // Detección más flexible
    if (content.includes(q.keyword.toLowerCase())) {
      console.log(`[KEYWORD DETECTADA] "${q.keyword}" en mensaje de ${message.author.tag}`);
      
      const embed = createPinkEmbed('📌 Respuesta automática', q.response);
      return message.reply({ embeds: [embed] }).catch(console.error);
    }
  }
});

// ===================== LOGIN =====================
client.login(process.env.TOKEN);
