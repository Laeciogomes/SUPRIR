// Views de acesso e estados iniciais: configuração ausente, carregamento,
// erro de autenticação, login e troca de senha. Código MOVIDO de
// application.js sem alteração do HTML gerado.
import { CONFIG } from '../config/app-config.js';
import { icon } from '../ui/icons.js';
import { escapeHtml } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { imageTag, institution } from '../app/helpers.js';
import { renderModal } from '../modals/index.js';
import { renderNoticeModal, renderToast } from './shell.js';

export function renderConfigMissing() {
  return `
    <main class="center-page">
      <section class="setup-card">
        <div class="setup-icon">${icon('settings', 34)}</div>
        <span class="eyebrow">Configuração necessária</span>
        <h1>Conecte o sistema ao Supabase</h1>
        <p>Crie o arquivo <code>.env.local</code> na raiz do projeto e informe a URL e a chave pública do projeto.</p>
        <pre>VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_SUA_CHAVE</pre>
        <p class="subtle">Depois, reinicie o comando <strong>npm run dev</strong>.</p>
      </section>
    </main>`;
}

export function renderLoadingScreen() {
  const inst = institution();
  return `
    <main class="center-page">
      <section class="loading-card">
        ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé', 'loading-logo')}
        <div class="spinner large"></div>
        <h2>Carregando seu ambiente</h2>
        <p>Estamos preparando os pedidos e permissões do seu acesso.</p>
      </section>
    </main>`;
}

export function renderAuthError() {
  const inst = institution();
  return `
    <main class="center-page">
      <section class="setup-card auth-error-card">
        ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé', 'loading-logo')}
        <div class="setup-icon danger">${icon('alert', 32)}</div>
        <span class="eyebrow">Não foi possível abrir o ambiente</span>
        <h1>Verifique a configuração do acesso</h1>
        <p>${escapeHtml(state.authError || 'O perfil do usuário não pôde ser carregado.')}</p>
        <div class="button-row auth-error-actions">
          <button type="button" class="button primary" data-action="retry-auth">${icon('refresh', 18)} Tentar novamente</button>
          <button type="button" class="button secondary" data-action="logout">${icon('logout', 18)} Voltar ao login</button>
        </div>
      </section>
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${renderToast()}
    </main>`;
}

export function renderLogin() {
  const inst = institution();
  const schoolActive = state.loginPortal === 'school';
  const loginField = schoolActive
    ? `<label class="field"><span>Código da escola</span><div class="input-with-icon">${icon('school', 18)}<input type="text" name="login" inputmode="numeric" autocomplete="username" maxlength="20" placeholder="Ex.: 23047135" required /></div><small>Use o código de acesso fornecido pela SME.</small></label>`
    : `<label class="field"><span>E-mail institucional</span><div class="input-with-icon">${icon('mail', 18)}<input type="email" name="login" autocomplete="username" placeholder="nome@municipio.gov.br" required /></div></label>`;
  return `
    <main class="login-page">
      <section class="login-brand-panel">
        <div class="login-brand-top">
          ${imageTag(inst.logoUrl, 'Prefeitura Municipal de Canindé e Secretaria de Educação', 'brand-logo-horizontal', CONFIG.logoFallbackUrl)}
        </div>
        ${imageTag(inst.planningLogoUrl, 'Brasão de Canindé', 'login-brand-seal', inst.compactLogoUrl)}

        <div class="login-brand-content">
          <div class="login-hero-copy">
            <span class="eyebrow light">Gestão integrada de materiais</span>
            <h1>Do pedido da escola à confirmação da entrega.</h1>
            <p>Um fluxo seguro e rastreável para solicitar, analisar, autorizar, separar, expedir e acompanhar materiais escolares.</p>
          </div>
          <div class="login-feature-grid">
            <article>${icon('clipboard', 22)}<div><strong>Pedidos digitais</strong><span>Protocolo e acompanhamento em tempo real</span></div></article>
            <article>${icon('shield', 22)}<div><strong>Auditoria completa</strong><span>Quem solicitou, analisou, expediu e confirmou</span></div></article>
            <article>${icon('truck', 22)}<div><strong>Entrega controlada</strong><span>Remessas parciais e confirmação pela escola</span></div></article>
            <article>${icon('report', 22)}<div><strong>Relatórios gerenciais</strong><span>Por escola, período, situação e material</span></div></article>
          </div>
        </div>
        <div class="login-brand-footer">Sistema institucional • acesso restrito a usuários autorizados</div>
      </section>

      <section class="login-form-panel">
        <div class="login-mobile-brand">
          ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé')}
          <div><strong>Prefeitura Municipal de Canindé</strong><span>${escapeHtml(inst.departmentName)}</span></div>
        </div>
        <div class="login-system-brand">
          <img src="/favicon-192x192.png" alt="SUPRIR Educação" class="login-system-brand-logo" />
        </div>
        <div class="login-card">
          <div class="login-card-heading">
            <span class="eyebrow">Acesso ao sistema</span>
            <h2>Bem-vindo</h2>
            <p>Selecione seu ambiente e entre com o acesso fornecido pela SME.</p>
          </div>

          <div class="portal-switch" role="tablist" aria-label="Tipo de acesso">
            <button type="button" class="portal-option ${schoolActive ? 'active' : ''}" data-action="choose-portal" data-portal="school">
              <span class="portal-option-icon">${icon('school', 22)}</span>
              <span><strong>Escola</strong><small>Fazer e acompanhar pedidos</small></span>
            </button>
            <button type="button" class="portal-option ${!schoolActive ? 'active' : ''}" data-action="choose-portal" data-portal="sme">
              <span class="portal-option-icon">${icon('building', 22)}</span>
              <span><strong>SME</strong><small>Analisar, autorizar e expedir</small></span>
            </button>
          </div>

          <form id="login-form" class="form-stack">
            ${loginField}
            <label class="field">
              <span>Senha</span>
              <div class="input-with-icon password-wrap">${icon('lock', 18)}<input type="password" name="password" autocomplete="current-password" placeholder="Digite sua senha" required /><button type="button" class="icon-button inline" data-action="toggle-password" aria-label="Mostrar ou ocultar senha">${icon('eye', 18)}</button></div>
            </label>
            <button class="button primary large full" type="submit">${icon('lock', 18)} Entrar no portal ${schoolActive ? 'da escola' : 'da SME'}</button>
            <button class="text-button" type="button" data-action="forgot-password">${schoolActive ? 'Preciso redefinir a senha' : 'Esqueci minha senha'}</button>
          </form>
          <div class="login-help">${schoolActive ? 'No primeiro acesso, informe o código da escola e o PIN temporário. O sistema solicitará uma nova senha pessoal.' : 'Acesso restrito à equipe da SME com e-mail institucional.'}</div>
          ${!state.isStandaloneApp ? `<button class="text-button install-login-button" type="button" data-action="install-app">${icon('smartphone', 17)} Instalar como aplicativo</button>` : ''}
        </div>
      </section>
      ${state.loading ? `<div class="loading-overlay"><div class="spinner large"></div><strong>Autenticando...</strong></div>` : ''}
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${renderToast()}
    </main>`;
}

export function renderPasswordChange() {
  const inst = institution();
  return `
    <main class="center-page password-page">
      <section class="password-card">
        ${imageTag(inst.compactLogoUrl, 'Brasão de Canindé', 'password-logo')}
        <div class="setup-icon">${icon('key', 30)}</div>
        <span class="eyebrow">Proteção da conta</span>
        <h1>Crie uma nova senha</h1>
        <p>${state.recoveryMode ? 'Defina uma nova senha para recuperar seu acesso.' : 'Esta é uma senha temporária. Para continuar, cadastre uma senha de uso pessoal.'}</p>
        <form id="password-change-form" class="form-stack">
          <label class="field">
            <span>Nova senha</span>
            <div class="input-with-icon password-wrap">${icon('lock', 18)}<input type="password" name="password" minlength="8" autocomplete="new-password" required /><button type="button" class="icon-button inline" data-action="toggle-password">${icon('eye', 18)}</button></div>
            <small>Use ao menos 8 caracteres, com letras e números.</small>
          </label>
          <label class="field">
            <span>Confirmar nova senha</span>
            <div class="input-with-icon password-wrap">${icon('lock', 18)}<input type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required /><button type="button" class="icon-button inline" data-action="toggle-password">${icon('eye', 18)}</button></div>
          </label>
          <button class="button primary large full" type="submit">${icon('check', 18)} Salvar nova senha</button>
          <button class="text-button" type="button" data-action="logout">Sair desta conta</button>
        </form>
      </section>
      ${state.modal ? renderModal() : ''}
      ${state.notice ? renderNoticeModal() : ''}
      ${renderToast()}
    </main>`;
}
