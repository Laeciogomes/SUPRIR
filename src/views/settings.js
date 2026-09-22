// View de configurações institucionais. Código MOVIDO de application.js
// sem alteração do HTML gerado.
import { CONFIG } from '../config/app-config.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, attr } from '../utils/formatters.js';
import { imageTag, institution } from '../app/helpers.js';

export function renderSettings() {
  const inst = institution();
  return `
    <form id="settings-form" class="stack-lg">
      <section class="panel form-section">
        <div class="section-title"><span>${icon('building', 21)}</span><div><h3>Identidade institucional</h3><p>Essas informações aparecem no cabeçalho do sistema e nos relatórios impressos.</p></div></div>
        <div class="settings-preview">
          <div class="settings-preview-brand">${imageTag(inst.logoUrl, 'Marca institucional atual', '', CONFIG.logoFallbackUrl)}</div>
          <div class="settings-preview-copy"><span>${escapeHtml(inst.municipalityName)}</span><strong>${escapeHtml(inst.departmentName)}</strong><small>${escapeHtml(inst.reportTitle)}</small></div>
          <div class="settings-preview-symbols">${imageTag(inst.compactLogoUrl, 'Brasão compacto')}${imageTag(inst.planningLogoUrl, 'Brasão / marca de apoio', '', inst.compactLogoUrl)}</div>
        </div>
        <div class="form-grid two">
          <label class="field"><span>Nome do município *</span><input type="text" name="municipality_name" value="${attr(inst.municipalityName)}" required /></label>
          <label class="field"><span>Nome da secretaria / núcleo *</span><input type="text" name="department_name" value="${attr(inst.departmentName)}" required /></label>
          <label class="field span-2"><span>Título do sistema / relatório *</span><input type="text" name="report_title" value="${attr(inst.reportTitle)}" required /></label>
          <label class="field span-2"><span>Marca horizontal institucional *</span><input type="text" name="logo_url" value="${attr(inst.logoUrl)}" required /><small>Padrão: /assets/brand/logo-secretaria-educacao-caninde.png</small></label>
          <label class="field"><span>Brasão compacto *</span><input type="text" name="compact_logo_url" value="${attr(inst.compactLogoUrl)}" required /><small>Padrão: /assets/brand/brasao-caninde.webp</small></label>
          <label class="field"><span>Brasão / marca de apoio *</span><input type="text" name="planning_logo_url" value="${attr(inst.planningLogoUrl)}" required /><small>Padrão: /assets/brand/brasao-caninde.webp</small></label>
          <label class="field span-2"><span>Endereço institucional</span><input type="text" name="address" value="${attr(inst.address)}" /></label>
          <label class="field"><span>Telefone</span><input type="text" name="phone" value="${attr(inst.phone)}" /></label>
          <label class="field"><span>E-mail</span><input type="email" name="email" value="${attr(inst.email)}" /></label>
          <label class="field span-2"><span>Rodapé dos relatórios</span><textarea name="footer_text" rows="3">${escapeHtml(inst.footerText)}</textarea></label>
        </div>
      </section>
      <section class="form-actions"><div><strong>Configurações globais</strong><span>A alteração passa a valer para todos os usuários após salvar.</span></div><button type="submit" class="button primary">${icon('save', 18)} Salvar configurações</button></section>
    </form>`;
}
