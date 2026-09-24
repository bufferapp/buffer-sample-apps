import express from 'express'
import path from 'node:path'
import { HttpError, REDIRECT_URI, withCause } from './config.js'
import { readSession } from './session.js'
import {
  ACCOUNT_QUERY,
  CHANNELS_QUERY,
  CREATE_POST,
  buildAuthorizeUrl,
  buildPostInput,
  createPkcePair,
  createState,
  exchangeCodeForTokens,
  graphql,
} from './buffer.js'

const app = express()
app.use(express.json())

// Every route gets the session up front; routes that change it save explicitly.
app.use(async (req, res, next) => {
  try {
    req.session = await readSession(req, res)
    req.ctx = { req, res, session: req.session }
    next()
  } catch (err) {
    next(err)
  }
})

app.use(express.static(path.join(import.meta.dirname, '..', 'public')))

// Account data and authentication cookies must never be stored by a shared cache.
app.use(['/api', '/auth', '/callback'], (_req, res, next) => {
  res.set('Cache-Control', 'no-store, private')
  next()
})

// Lets a route throw HttpError and have it become a real response.
const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
}

app.get('/auth/login', async (req, res) => {
  const { verifier, challenge } = createPkcePair()
  const state = createState()

  // Note the asymmetry: we keep the verifier and the state, and send out only
  // the challenge (the hash) and the state.
  req.session.pkce = { codeVerifier: verifier, state }
  await req.session.save()

  res.redirect(buildAuthorizeUrl({ state, codeChallenge: challenge }))
})

app.get('/callback', async (req, res) => {
  const { code, state, error, error_description: description } = req.query
  const pkce = req.session.pkce
  req.session.pkce = null   // one-time values — discard either way

  if (error) {
    await req.session.save()
    return res.redirect(`/?error=${encodeURIComponent(description || error)}`)
  }
  // CSRF check: only a callback this app started carries the state we stored.
  // A missing session and a mismatched state have different causes, so they get
  // different messages.
  if (!pkce) {
    await req.session.save()
    return res.status(403).send(
      'Session lost: this callback carries no record of the login that started it. ' +
        'Usually the server restarted between Connect and coming back here (a SESSION_SECRET that changes ' +
        'invalidates every session cookie), or the flow started on a different origin than ' +
        `${REDIRECT_URI} — localhost and 127.0.0.1 are separate cookie origins. Start again from the connect screen.`,
    )
  }
  if (state !== pkce.state) {
    await req.session.save()
    return res.status(403).send('Invalid state parameter: this callback did not come from a login this app started.')
  }

  try {
    // The code is short-lived, so exchange it immediately.
    req.session.tokens = await exchangeCodeForTokens({ code, codeVerifier: pkce.codeVerifier })
    await req.session.save()
    res.redirect('/')
  } catch (err) {
    console.error(JSON.stringify({ event: 'oauth_token_exchange_failed', code: err.oauthError, message: err.message }))
    await req.session.save()
    const message = withCause('Buffer could not complete the connection. Check your client configuration.', err.message)
    res.redirect(`/?error=${encodeURIComponent(message)}`)
  }
})

app.post('/auth/logout', async (req, res) => {
  await req.session.destroy()
  res.json({ connected: false })
})

app.get('/api/session', wrap(async (req, res) => {
  // redirectUri is echoed back for debugging: curl this endpoint to see the
  // exact callback the app will send, rather than guessing from Buffer's
  // generic error page.
  if (!req.session.tokens) return res.json({ connected: false, redirectUri: REDIRECT_URI })

  const data = await graphql(req.ctx, ACCOUNT_QUERY)
  const { scope, connectedAt } = req.session.tokens
  res.json({
    connected: true,
    account: data.account,
    scope,
    redirectUri: REDIRECT_URI,
    connectedAt,
  })
}))

app.get('/api/channels', wrap(async (req, res) => {
  const organizationId = req.query.organizationId
  if (!organizationId) throw new HttpError(400, 'organizationId is required')

  const data = await graphql(req.ctx, CHANNELS_QUERY, { organizationId })
  res.json({ channels: data.channels.filter((c) => !c.isDisconnected) })
}))

// The one feature: add a post to a channel's queue.
app.post('/api/posts', wrap(async (req, res) => {
  const { channelId, organizationId, text, mediaUrl } = req.body || {}
  if (!channelId) throw new HttpError(400, 'channelId is required')
  if (!organizationId) throw new HttpError(400, 'organizationId is required')
  if (!text?.trim()) throw new HttpError(400, 'text is required')
  // Buffer fetches the file when the post publishes, so the URL has to be
  // public and served over https.
  if (mediaUrl?.trim() && !/^https:\/\//i.test(mediaUrl.trim())) {
    throw new HttpError(400, 'mediaUrl must be a public https URL')
  }

  // `service` controls required metadata, so do not trust it from the browser.
  const channels = (await graphql(req.ctx, CHANNELS_QUERY, { organizationId })).channels
  const channel = channels.find((candidate) => candidate.id === channelId && !candidate.isDisconnected)
  if (!channel) throw new HttpError(400, 'Select a connected channel in the chosen organization')

  const result = (await graphql(req.ctx, CREATE_POST, {
    input: buildPostInput({
      channelId,
      service: channel.service,
      text: text.trim(),
      mediaUrl: mediaUrl?.trim() || null,
    }),
  })).createPost

  // A typed error comes back as data, not as a thrown exception — the union
  // member tells us the operation failed even though the request succeeded.
  if (!result?.post) {
    console.warn(JSON.stringify({ event: 'buffer_post_rejected', message: result?.message }))
    // The union's error member carries Buffer's own reason — too long for the
    // network, channel not found, limit reached — which is what a builder needs.
    throw new HttpError(400, withCause('Buffer could not create that draft.', result?.message))
  }

  res.json({ post: result.post })
}))

// Misconfiguration (a missing SESSION_SECRET, for instance) should read as a
// clear message instead of an opaque platform 500.
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({ event: 'unhandled_request_error', name: err.name, message: err.message }))
  res.status(500).json({ error: withCause('Something went wrong. Please try again.', err.message) })
})

export default app
