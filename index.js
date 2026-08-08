require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const DATA_FILE = path.join(__dirname, 'data.json');
const PREFIX = '.';
const PINK = 0xFF69B4; // Rosa bonito

// ===================== BASE DE DATOS SIMPLE =====================
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getGuildData(guildId) {
  const data = loadData();
  if (!data[guildId]) {
    data[guildId] = {
      allowedRole: null,
      questions: [] // { keyword, command, response }
    };
    saveData(data);
  }
  return data[guildId];
}

// ===================== FUNCIONES DE UTILIDAD =====================
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
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildData = getGuildData(message.guild.id);
  const content = message.content.toLowerCase().trim();
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();

  // ========== DETECCIÓN DE PALABRAS CLAVE ==========
  for (const q of guildData.questions) {
    if (q.keyword && content.includes(q.keyword.toLowerCase())) {
      const embed = createPinkEmbed('📌 Respuesta automática', q.response);
      return message.reply({ embeds: [embed] });
    }
  }

  // ========== COMANDOS CON PREFIX ==========
  if (!message.content.startsWith(PREFIX)) return;

  // ----- .agregar-pregunta -----
  if (commandName === 'agregar-pregunta') {
    if (!hasPermission(message.member, guildData)) {
      return message.reply({ embeds: [createPinkEmbed('❌ Sin permiso', 'No tienes el rol necesario para agregar preguntas.')] });
    }

    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 120000, max: 3 });

    let step = 0;
    let keyword = '', cmd = '', response = '';

    message.reply({ embeds: [createPinkEmbed('➕ Agregar pregunta', '**Paso 1/3**\nEscribe la **palabra clave** que activará la respuesta automática (ejemplo: papeles)')] });

    collector.on('collect', async (m) => {
      step++;

      if (step === 1) {
        keyword = m.content.trim();
        await m.reply({ embeds: [createPinkEmbed('➕ Agregar pregunta', '**Paso 2/3**\nEscribe el **comando** (sin el punto). Ejemplo: papeles')] });
      } 
      else if (step === 2) {
        cmd = m.content.trim().toLowerCase().replace('.', '');
        await m.reply({ embeds: [createPinkEmbed('➕ Agregar pregunta', '**Paso 3/3**\nEscribe la **respuesta** completa que dará el bot')] });
      } 
      else if (step === 3) {
        response = m.content.trim();

        guildData.questions.push({
          keyword: keyword,
          command: cmd,
          response: response
        });

        const data = loadData();
        data[message.guild.id] = guildData;
        saveData(data);

        const embed = createPinkEmbed('✅ Pregunta agregada', 
          `**Palabra clave:** ${keyword}\n**Comando:** \`.${cmd}\`\n**Respuesta:**\n${response}`
        );
        await m.reply({ embeds: [embed] });
        collector.stop();
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && step < 3) {
        message.channel.send({ embeds: [createPinkEmbed('⏰ Tiempo agotado', 'Se canceló el proceso de agregar pregunta.')] });
      }
    });
  }

  // ----- .config-rol -----
  else if (commandName === 'config-rol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [createPinkEmbed('❌ Solo administradores', 'Solo los administradores pueden usar este comando.')] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [createPinkEmbed('❌ Uso incorrecto', 'Usa: `.config-rol @rol`')] });
    }

    guildData.allowedRole = role.id;
    const data = loadData();
    data[message.guild.id] = guildData;
    saveData(data);

    message.reply({ embeds: [createPinkEmbed('✅ Rol configurado', `Ahora el rol **${role.name}** puede agregar preguntas.`)] });
  }

  // ----- .lista-preguntas -----
  else if (commandName === 'lista-preguntas') {
    if (guildData.questions.length === 0) {
      return message.reply({ embeds: [createPinkEmbed('📋 Lista vacía', 'No hay preguntas configuradas todavía.')] });
    }

    let desc = '';
    guildData.questions.forEach((q, i) => {
      desc += `**${i + 1}.** \`.${q.command}\`\n🔑 Palabra clave: \`${q.keyword}\`\n💬 ${q.response.substring(0, 80)}${q.response.length > 80 ? '...' : ''}\n\n`;
    });

    message.reply({ embeds: [createPinkEmbed('📋 Lista de preguntas', desc)] });
  }

  // ----- .eliminar-pregunta -----
  else if (commandName === 'eliminar-pregunta') {
    if (!hasPermission(message.member, guildData)) {
      return message.reply({ embeds: [createPinkEmbed('❌ Sin permiso', 'No tienes permiso para eliminar preguntas.')] });
    }

    const index = parseInt(args[0]) - 1;
    if (isNaN(index) || index < 0 || index >= guildData.questions.length) {
      return message.reply({ embeds: [createPinkEmbed('❌ Uso incorrecto', 'Usa: `.eliminar-pregunta <número>`\nMira los números con `.lista-preguntas`')] });
    }

    const deleted = guildData.questions.splice(index, 1)[0];
    const data = loadData();
    data[message.guild.id] = guildData;
    saveData(data);

    message.reply({ embeds: [createPinkEmbed('🗑️ Pregunta eliminada', `Se eliminó: \`.${deleted.command}\``)] });
  }

  // ----- COMANDOS PERSONALIZADOS -----
  else {
    const found = guildData.questions.find(q => q.command === commandName);
    if (found) {
      const embed = createPinkEmbed('💬 Respuesta', found.response);
      return message.reply({ embeds: [embed] });
    }
  }
});

// ===================== READY =====================
client.once('ready', () => {
  console.log(`✅ Bot iniciado como ${client.user.tag}`);
  client.user.setActivity('Florida Preguntas | .ayuda', { type: 3 });
});

// ===================== LOGIN =====================
client.login(process.env.TOKEN);
