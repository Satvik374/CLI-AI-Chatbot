import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import config from './config.js';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Recommended Google Cloud (Vertex AI / Gemini) text AI models
 */
export const RECOMMENDED_GCLOUD_MODELS = [
  { id: 'gemini-2.5-flash',            name: 'Gemini 2.5 Flash (Verified)',desc: 'Flagship fast & intelligent Vertex AI model' },
  { id: 'gemini-2.5-pro',              name: 'Gemini 2.5 Pro (Verified)',  desc: 'Flagship reasoning & multi-modal Vertex AI model' },
  { id: 'claude-3-7-sonnet@20250219',  name: 'Claude 3.7 Sonnet (Vertex)',desc: 'Anthropic Claude 3.7 on Google Cloud Vertex AI' },
  { id: 'claude-3-5-sonnet-v2@20241022',name: 'Claude 3.5 Sonnet (Vertex)',desc: 'Anthropic Claude 3.5 Sonnet on Google Cloud' },
  { id: 'claude-3-5-haiku@20241022',   name: 'Claude 3.5 Haiku (Vertex)', desc: 'Anthropic Claude 3.5 Haiku on Google Cloud' },
  { id: 'gemini-3.6-flash',            name: 'Gemini 3.6 Flash',          desc: 'Next-gen Gemini model (requires AI Studio key)' },
  { id: 'gemini-3.5-flash',            name: 'Gemini 3.5 Flash',          desc: 'High performance Gemini text model' },
  { id: 'gemini-3.5-flash-lite',       name: 'Gemini 3.5 Flash Lite',     desc: 'Ultra lightweight Gemini model' },
  { id: 'gemini-2.0-flash',            name: 'Gemini 2.0 Flash',           desc: 'Fast and reliable general model' },
  { id: 'gemini-1.5-pro',              name: 'Gemini 1.5 Pro',             desc: '1M+ context window model' },
  { id: 'gemini-1.5-flash',            name: 'Gemini 1.5 Flash',           desc: 'Fast 1M+ context model' },
  { id: 'meta/llama-3.3-70b-instruct-maas', name: 'Llama 3.3 70B (Vertex)', desc: 'Meta Llama 3.3 on Google Cloud Vertex' },
  { id: 'mistral-large@2407',          name: 'Mistral Large (Vertex)',    desc: 'Mistral Large model on Google Cloud' },
  { id: 'code-bison@002',              name: 'Codey Code-Bison',          desc: 'Google Codey code generation model' },
];

/** Locate ADC file path on OS */
function getADCFilePath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const appData = process.env.APPDATA || join(homedir(), '.config');
  return join(appData, 'gcloud', 'application_default_credentials.json');
}

/** Load ADC credentials object from config, env, or ADC file */
export function loadGCloudCredentialsObj() {
  const cfgCreds = config.get('gcloudCredentials');
  if (cfgCreds && typeof cfgCreds === 'object' && cfgCreds.refresh_token) {
    return cfgCreds;
  }

  const tokenStr = config.get('gcloudAccessToken');
  if (tokenStr && tokenStr.startsWith('{')) {
    try { return JSON.parse(tokenStr); } catch {}
  }

  const adcPath = getADCFilePath();
  if (existsSync(adcPath)) {
    try {
      const content = readFileSync(adcPath, 'utf8');
      return JSON.parse(content);
    } catch {}
  }

  return null;
}

/** Save ADC credentials object */
export function saveGCloudCredentialsObj(credsObj) {
  if (!credsObj || typeof credsObj !== 'object') return false;
  config.set('gcloudCredentials', credsObj);
  config.set('apiFormat', 'gcloud');
  if (credsObj.quota_project_id || credsObj.project_id) {
    config.set('gcloudProject', credsObj.quota_project_id || credsObj.project_id);
  }
  config.save();

  // Also write to ADC file for standard compatibility
  try {
    const adcPath = getADCFilePath();
    const dir = join(adcPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(adcPath, JSON.stringify(credsObj, null, 2), 'utf8');
  } catch {}

  cachedToken = null;
  tokenExpiresAt = 0;
  return true;
}

/** Exchange refresh_token for a fresh OAuth access_token */
export function exchangeRefreshTokenSync(credsObj) {
  if (!credsObj || !credsObj.refresh_token || !credsObj.client_id || !credsObj.client_secret) {
    return null;
  }

  try {
    const payload = JSON.stringify({
      client_id: credsObj.client_id,
      client_secret: credsObj.client_secret,
      refresh_token: credsObj.refresh_token,
      grant_type: 'refresh_token',
    });

    const script = `
      fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ${JSON.stringify(payload)}
      }).then(r => r.json()).then(d => process.stdout.write(JSON.stringify(d)));
    `;

    const out = execSync(`node -e ${JSON.stringify(script)}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();

    const data = JSON.parse(out);
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + Math.max(300, (data.expires_in || 3600) - 300) * 1000;
      return cachedToken;
    }
  } catch {}

  return null;
}

/**
 * Retrieve Gcloud Access Token.
 */
export function getGCloudAccessToken() {
  // 1. Check in-memory cache
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  // 2. Check stored ADC / Refresh Token JSON credentials
  const credsObj = loadGCloudCredentialsObj();
  if (credsObj) {
    const freshToken = exchangeRefreshTokenSync(credsObj);
    if (freshToken) return freshToken;
  }

  // 3. Explicit gcloudAccessToken in config (string token)
  const gcloudToken = config.get('gcloudAccessToken');
  if (gcloudToken && gcloudToken.trim() && !gcloudToken.startsWith('{') && gcloudToken !== 'gcloud' && gcloudToken !== 'auto') {
    return gcloudToken.trim();
  }

  // 4. Check if apiKey in config is a Google key (ya29... or AIza...)
  const apiKey = config.get('apiKey');
  if (apiKey && (apiKey.startsWith('ya29.') || apiKey.startsWith('AIza'))) {
    return apiKey.trim();
  }

  // 5. Env variables
  if (process.env.GCLOUD_ACCESS_TOKEN) return process.env.GCLOUD_ACCESS_TOKEN.trim();
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN.trim();

  // 6. Try gcloud auth print-access-token
  try {
    const token = execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    if (token && token.length > 20 && !token.includes('ERROR') && !token.includes('error')) {
      cachedToken = token;
      tokenExpiresAt = Date.now() + 45 * 60 * 1000;
      return cachedToken;
    }
  } catch {}

  // 7. Try gcloud auth application-default print-access-token
  try {
    const token = execSync('gcloud auth application-default print-access-token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    if (token && token.length > 20 && !token.includes('ERROR') && !token.includes('error')) {
      cachedToken = token;
      tokenExpiresAt = Date.now() + 45 * 60 * 1000;
      return cachedToken;
    }
  } catch {}

  return '';
}

/**
 * Retrieve Google Cloud Project ID.
 */
export function getGCloudProject() {
  const cfgProj = config.get('gcloudProject');
  if (cfgProj) return cfgProj;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

  const credsObj = loadGCloudCredentialsObj();
  if (credsObj && (credsObj.quota_project_id || credsObj.project_id)) {
    return credsObj.quota_project_id || credsObj.project_id;
  }

  try {
    const proj = execSync('gcloud config get-value project', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (proj && proj !== '(unset)' && !proj.includes('ERROR')) {
      return proj;
    }
  } catch {}

  return '';
}

/**
 * Retrieve Google Cloud Region / Location.
 */
export function getGCloudLocation() {
  return config.get('gcloudLocation') ||
    process.env.GCLOUD_LOCATION ||
    process.env.GOOGLE_CLOUD_LOCATION ||
    'global';
}

/**
 * Get comprehensive Google Cloud auth status.
 */
export function getGCloudAuthStatus() {
  const project = getGCloudProject();
  const location = getGCloudLocation();
  const token = getGCloudAccessToken();
  const credsObj = loadGCloudCredentialsObj();
  let account = credsObj?.account || '';

  if (!account) {
    try {
      account = execSync('gcloud config get-value account', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      }).trim();
      if (account === '(unset)' || account.includes('ERROR')) account = '';
    } catch {}
  }

  const hasToken = !!token;
  const tokenSource = credsObj
    ? 'Google Authorized User Credentials (refresh_token)'
    : (config.get('gcloudAccessToken') || config.get('apiKey'))
      ? 'config'
      : (process.env.GCLOUD_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN)
        ? 'environment'
        : (cachedToken ? 'gcloud CLI (cached)' : (hasToken ? 'gcloud CLI' : 'none'));

  return {
    authenticated: hasToken && !!project,
    account: account || (credsObj ? 'Google OAuth2 User' : 'gcloud CLI default'),
    project: project || '(not set)',
    location: location,
    hasToken,
    tokenSource,
  };
}

/**
 * Refresh cached token directly.
 */
export function refreshGCloudToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
  return getGCloudAccessToken();
}
