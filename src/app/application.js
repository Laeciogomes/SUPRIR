import { CONFIG } from '../config/app-config.js';
import { state, setRenderer, resetSecureState } from './state.js';
import { isSchool } from './helpers.js';
import {
  initSupabase,
  createSupabaseClient,
  loadAuthenticatedData
} from '../services/supabase.js';
import { initPwa, setupPwaFeatures } from './pwa.js';
import { initPrint } from './print.js';
import { initDownloads } from '../services/downloads.js';
import {
  institution,
  requestTotals,
  deliveredQuantityForItem,
  getSchoolName,
  getAllDeliveries
} from './helpers.js';
import { getReportData, requestItemReportRows, renderRequestItemsReportBlock } from '../views/reports.js';
import { hasConfig, render } from './router.js';
import { openNotice, setToast, friendlyError } from './notices.js';
import { registerEventListeners } from './events.js';

// Entry fino da aplicação. Após a decomposição em módulos (router, actions,
// forms, events, notices, services), application.js apenas: injeta os helpers
// remanescentes nos módulos de infraestrutura, registra o render() no render
// bus, anexa os listeners delegados e inicializa a sessão. main.js continua
// importando styles/index.css e este arquivo.

let supabase = null;

async function initialize() {
  document.title = `${CONFIG.reportTitle} | Canindé`;
  // Injeta nos módulos de infraestrutura os helpers de UI/negócio.
  initSupabase({ setToast, friendlyError, isSchool, getAllDeliveries });
  initPwa({ openNotice, friendlyError });
  initPrint({
    institution,
    requestTotals,
    deliveredQuantityForItem,
    getReportData,
    getSchoolName,
    isSchool,
    renderRequestItemsReportBlock,
    setToast
  });
  initDownloads({ getReportData, getSchoolName, requestItemReportRows, setToast });
  setupPwaFeatures();

  if (!hasConfig()) {
    render();
    return;
  }

  supabase = createSupabaseClient();

  const { data, error } = await supabase.auth.getSession();
  if (error) setToast('error', friendlyError(error));
  state.session = data?.session || null;

  if (state.session) await loadAuthenticatedData(false);
  render();

  supabase.auth.onAuthStateChange(async (event, session) => {
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') state.recoveryMode = true;

    if (!session) {
      resetSecureState();
      render();
      return;
    }

    if (!state.profile || state.profile.id !== session.user.id) {
      await loadAuthenticatedData(false);
      render();
    }
  });
}

// Registra render() no render bus de state.js para que os módulos de
// infraestrutura possam disparar renderização sem dependência circular.
setRenderer(render);

// Anexa os quatro listeners delegados no #app (click, input, change, submit).
registerEventListeners();

initialize();
