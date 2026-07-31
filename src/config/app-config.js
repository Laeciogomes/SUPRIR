export const CONFIG = Object.freeze({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  municipalityName: import.meta.env.VITE_MUNICIPIO_NOME || 'Prefeitura Municipal de Canindé',
  departmentName: import.meta.env.VITE_SECRETARIA_NOME || 'Secretaria Municipal de Educação',
  reportTitle: import.meta.env.VITE_TITULO_SISTEMA || 'Sistema Integrado de Pedidos e Entrega de Materiais',
  logoUrl: import.meta.env.VITE_LOGO_URL || '/assets/brand/logo-secretaria-educacao-caninde.png',
  compactLogoUrl: import.meta.env.VITE_LOGO_COMPACTA_URL || '/assets/brand/brasao-caninde.webp',
  planningLogoUrl: import.meta.env.VITE_LOGO_PLANEJAMENTO_URL || '/assets/brand/brasao-caninde.webp',
  logoFallbackUrl: import.meta.env.VITE_LOGO_FALLBACK_URL || '/assets/brand/brasao-caninde.webp',
  schoolLoginDomain: import.meta.env.VITE_SCHOOL_LOGIN_DOMAIN || 'escolas.caninde.ce.gov.br'
});
