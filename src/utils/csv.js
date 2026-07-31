function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectDelimiter(firstLine) {
  const candidates = ['\t', ';', ','];
  let best = ';';
  let max = -1;
  for (const candidate of candidates) {
    const count = [...firstLine].filter((char) => char === candidate).length;
    if (count > max) {
      best = candidate;
      max = count;
    }
  }
  return best;
}

function parseLine(line, delimiter) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function findHeaderIndex(headers, accepted) {
  return headers.findIndex((header) => accepted.includes(header));
}

export function parseSchoolAccessCsv(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], errors: ['O arquivo precisa conter o cabeçalho e pelo menos uma escola.'] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map(normalizeHeader);
  const nameIndex = findHeaderIndex(headers, ['NM_ESCOLA', 'NOME_ESCOLA', 'ESCOLA', 'NOME']);
  const loginIndex = findHeaderIndex(headers, ['DC_LOGIN', 'LOGIN', 'CODIGO_LOGIN', 'CODIGO', 'INEP']);
  const passwordIndex = findHeaderIndex(headers, ['SENHA', 'PASSWORD', 'PIN']);

  const errors = [];
  if (nameIndex < 0) errors.push('Coluna NM_ESCOLA não encontrada.');
  if (loginIndex < 0) errors.push('Coluna DC_LOGIN não encontrada.');
  if (passwordIndex < 0) errors.push('Coluna SENHA não encontrada.');
  if (errors.length) return { rows: [], errors };

  const rows = [];
  const seenCodes = new Set();

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseLine(lines[index], delimiter);
    const lineNumber = index + 1;
    const name = String(values[nameIndex] || '').trim().replace(/\s+/g, ' ');
    const loginCode = String(values[loginIndex] || '').replace(/\D/g, '');
    const password = String(values[passwordIndex] || '').trim();

    if (!name && !loginCode && !password) continue;
    if (name.length < 3) {
      errors.push(`Linha ${lineNumber}: nome da escola inválido.`);
      continue;
    }
    if (!/^\d{4,20}$/.test(loginCode)) {
      errors.push(`Linha ${lineNumber}: o código de acesso deve conter somente números.`);
      continue;
    }
    if (!( /^\d{6}$/.test(password) || password.length >= 8 )) {
      errors.push(`Linha ${lineNumber}: a senha deve ser um PIN de 6 dígitos ou ter pelo menos 8 caracteres.`);
      continue;
    }
    if (seenCodes.has(loginCode)) {
      errors.push(`Linha ${lineNumber}: código ${loginCode} repetido no arquivo.`);
      continue;
    }

    seenCodes.add(loginCode);
    rows.push({ name, loginCode, password, lineNumber });
  }

  return { rows, errors, delimiter };
}

export function createSchoolImportTemplate() {
  return 'NM_ESCOLA;DC_LOGIN;SENHA\r\nESCOLA EXEMPLO;23000000;123456\r\n';
}
