// Pure JavaScript Vietnamese IME (Telex & VNI)
// Tích hợp trực tiếp trên trình duyệt máy trạm làm bài thi

const VOWELS = {
  'a': ['a', 'á', 'à', 'ả', 'ã', 'ạ'],
  'ă': ['ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ'],
  'â': ['â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ'],
  'e': ['e', 'é', 'è', 'ẻ', 'ẽ', 'ẹ'],
  'ê': ['ê', 'ế', 'ề', 'ể', 'ễ', 'ệ'],
  'i': ['i', 'í', 'ì', 'ỉ', 'ĩ', 'ị'],
  'o': ['o', 'ó', 'ò', 'ỏ', 'õ', 'ọ'],
  'ô': ['ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ'],
  'ơ': ['ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ'],
  'u': ['u', 'ú', 'ù', 'ủ', 'ũ', 'ụ'],
  'ư': ['ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự'],
  'y': ['y', 'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ'],
};

const CHAR_MAP = {};
Object.entries(VOWELS).forEach(([base, forms]) => {
  forms.forEach((char, toneIdx) => {
    CHAR_MAP[char] = { base, tone: toneIdx, isUpper: false };
    CHAR_MAP[char.toUpperCase()] = { base, tone: toneIdx, isUpper: true };
  });
});

CHAR_MAP['d'] = { base: 'd', tone: 0, isUpper: false };
CHAR_MAP['D'] = { base: 'd', tone: 0, isUpper: true };
CHAR_MAP['đ'] = { base: 'đ', tone: 0, isUpper: false };
CHAR_MAP['Đ'] = { base: 'đ', tone: 0, isUpper: true };

function getToneChar(base, tone, isUpper) {
  if (VOWELS[base] && VOWELS[base][tone]) {
    const ch = VOWELS[base][tone];
    return isUpper ? ch.toUpperCase() : ch;
  }
  return base;
}

export function processVietnameseWord(word, key, mode = 'telex') {
  if (mode === 'off' || !key || key.length !== 1) return word + key;
  const isUpperKey = key === key.toUpperCase() && key !== key.toLowerCase();
  const lowerKey = key.toLowerCase();

  if (mode === 'telex') {
    const TONE_KEYS = { 's': 1, 'f': 2, 'r': 3, 'x': 4, 'j': 5, 'z': 0 };

    if (TONE_KEYS[lowerKey] !== undefined) {
      const targetTone = TONE_KEYS[lowerKey];
      const vowelIndices = [];
      for (let i = 0; i < word.length; i++) {
        const info = CHAR_MAP[word[i]];
        if (info && info.base !== 'd' && info.base !== 'đ') {
          vowelIndices.push(i);
        }
      }

      if (vowelIndices.length > 0) {
        let targetIdx = vowelIndices[vowelIndices.length - 1];
        const endsWithConsonant = !vowelIndices.includes(word.length - 1);

        if (vowelIndices.length === 2) {
          const v1 = CHAR_MAP[word[vowelIndices[0]]].base;
          const v2 = CHAR_MAP[word[vowelIndices[1]]].base;
          if (['oa', 'oe', 'uy', 'uê', 'uơ', 'ươ'].includes(v1 + v2) || endsWithConsonant) {
            targetIdx = vowelIndices[1];
          } else {
            targetIdx = vowelIndices[0];
          }
        } else if (vowelIndices.length >= 3) {
          targetIdx = vowelIndices[1];
        }

        const charInfo = CHAR_MAP[word[targetIdx]];
        if (charInfo.tone === targetTone && targetTone !== 0) {
          const unaccented = getToneChar(charInfo.base, 0, charInfo.isUpper);
          return word.substring(0, targetIdx) + unaccented + word.substring(targetIdx + 1) + key;
        }

        const newChar = getToneChar(charInfo.base, targetTone, charInfo.isUpper);
        return word.substring(0, targetIdx) + newChar + word.substring(targetIdx + 1);
      }
    }

    if (lowerKey === 'a') {
      const lastIdx = word.length - 1;
      if (lastIdx >= 0) {
        const lastInfo = CHAR_MAP[word[lastIdx]];
        if (lastInfo && lastInfo.base === 'a') {
          return word.substring(0, lastIdx) + getToneChar('â', lastInfo.tone, lastInfo.isUpper);
        } else if (lastInfo && lastInfo.base === 'â') {
          return word.substring(0, lastIdx) + getToneChar('a', lastInfo.tone, lastInfo.isUpper) + key;
        }
      }
    }

    if (lowerKey === 'w') {
      for (let i = 0; i < word.length - 1; i++) {
        const uInfo = CHAR_MAP[word[i]];
        const oInfo = CHAR_MAP[word[i + 1]];
        if (uInfo && oInfo && (uInfo.base === 'u' || uInfo.base === 'ư') && (oInfo.base === 'o' || oInfo.base === 'ơ')) {
          const uChar = getToneChar('ư', uInfo.tone, uInfo.isUpper);
          const oChar = getToneChar('ơ', oInfo.tone, oInfo.isUpper);
          return word.substring(0, i) + uChar + oChar + word.substring(i + 2);
        }
      }

      for (let i = word.length - 1; i >= 0; i--) {
        const info = CHAR_MAP[word[i]];
        if (info) {
          if (info.base === 'a') {
            return word.substring(0, i) + getToneChar('ă', info.tone, info.isUpper) + word.substring(i + 1);
          } else if (info.base === 'ă') {
            return word.substring(0, i) + getToneChar('a', info.tone, info.isUpper) + word.substring(i + 1) + key;
          } else if (info.base === 'o') {
            return word.substring(0, i) + getToneChar('ơ', info.tone, info.isUpper) + word.substring(i + 1);
          } else if (info.base === 'ơ') {
            return word.substring(0, i) + getToneChar('o', info.tone, info.isUpper) + word.substring(i + 1) + key;
          } else if (info.base === 'u') {
            return word.substring(0, i) + getToneChar('ư', info.tone, info.isUpper) + word.substring(i + 1);
          } else if (info.base === 'ư') {
            return word.substring(0, i) + getToneChar('u', info.tone, info.isUpper) + word.substring(i + 1) + key;
          }
        }
      }
    }

    if (lowerKey === 'e') {
      const lastIdx = word.length - 1;
      if (lastIdx >= 0) {
        const lastInfo = CHAR_MAP[word[lastIdx]];
        if (lastInfo && lastInfo.base === 'e') {
          return word.substring(0, lastIdx) + getToneChar('ê', lastInfo.tone, lastInfo.isUpper);
        } else if (lastInfo && lastInfo.base === 'ê') {
          return word.substring(0, lastIdx) + getToneChar('e', lastInfo.tone, lastInfo.isUpper) + key;
        }
      }
    }

    if (lowerKey === 'o') {
      const lastIdx = word.length - 1;
      if (lastIdx >= 0) {
        const lastInfo = CHAR_MAP[word[lastIdx]];
        if (lastInfo && lastInfo.base === 'o') {
          return word.substring(0, lastIdx) + getToneChar('ô', lastInfo.tone, lastInfo.isUpper);
        } else if (lastInfo && lastInfo.base === 'ô') {
          return word.substring(0, lastIdx) + getToneChar('o', lastInfo.tone, lastInfo.isUpper) + key;
        }
      }
    }

    if (lowerKey === 'd') {
      const lastIdx = word.length - 1;
      if (lastIdx >= 0) {
        const lastInfo = CHAR_MAP[word[lastIdx]];
        if (lastInfo && lastInfo.base === 'd') {
          const dChar = lastInfo.isUpper ? 'Đ' : 'đ';
          return word.substring(0, lastIdx) + dChar;
        } else if (lastInfo && lastInfo.base === 'đ') {
          const dChar = lastInfo.isUpper ? 'D' : 'd';
          return word.substring(0, lastIdx) + dChar + key;
        }
      }
    }
  } else if (mode === 'vni') {
    const VNI_TONE = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '0': 0 };
    if (VNI_TONE[key] !== undefined) {
      const targetTone = VNI_TONE[key];
      const vowelIndices = [];
      for (let i = 0; i < word.length; i++) {
        const info = CHAR_MAP[word[i]];
        if (info && info.base !== 'd' && info.base !== 'đ') vowelIndices.push(i);
      }
      if (vowelIndices.length > 0) {
        let targetIdx = vowelIndices[vowelIndices.length - 1];
        if (vowelIndices.length === 2) {
          const endsWithConsonant = !vowelIndices.includes(word.length - 1);
          targetIdx = endsWithConsonant ? vowelIndices[1] : vowelIndices[0];
        }
        const charInfo = CHAR_MAP[word[targetIdx]];
        const newChar = getToneChar(charInfo.base, targetTone, charInfo.isUpper);
        return word.substring(0, targetIdx) + newChar + word.substring(targetIdx + 1);
      }
    }

    if (key === '6') {
      for (let i = word.length - 1; i >= 0; i--) {
        const info = CHAR_MAP[word[i]];
        if (info && ['a', 'e', 'o'].includes(info.base)) {
          const targetBase = info.base === 'a' ? 'â' : (info.base === 'e' ? 'ê' : 'ô');
          return word.substring(0, i) + getToneChar(targetBase, info.tone, info.isUpper) + word.substring(i + 1);
        }
      }
    }

    if (key === '7') {
      for (let i = 0; i < word.length - 1; i++) {
        const uInfo = CHAR_MAP[word[i]];
        const oInfo = CHAR_MAP[word[i + 1]];
        if (uInfo && oInfo && (uInfo.base === 'u' || uInfo.base === 'ư') && (oInfo.base === 'o' || oInfo.base === 'ơ')) {
          const uChar = getToneChar('ư', uInfo.tone, uInfo.isUpper);
          const oChar = getToneChar('ơ', oInfo.tone, oInfo.isUpper);
          return word.substring(0, i) + uChar + oChar + word.substring(i + 2);
        }
      }
      for (let i = word.length - 1; i >= 0; i--) {
        const info = CHAR_MAP[word[i]];
        if (info && (info.base === 'o' || info.base === 'u')) {
          const targetBase = info.base === 'o' ? 'ơ' : 'ư';
          return word.substring(0, i) + getToneChar(targetBase, info.tone, info.isUpper) + word.substring(i + 1);
        }
      }
    }

    if (key === '8') {
      for (let i = word.length - 1; i >= 0; i--) {
        const info = CHAR_MAP[word[i]];
        if (info && info.base === 'a') {
          return word.substring(0, i) + getToneChar('ă', info.tone, info.isUpper) + word.substring(i + 1);
        }
      }
    }

    if (key === '9') {
      for (let i = word.length - 1; i >= 0; i--) {
        const info = CHAR_MAP[word[i]];
        if (info && info.base === 'd') {
          const dChar = info.isUpper ? 'Đ' : 'đ';
          return word.substring(0, i) + dChar + word.substring(i + 1);
        }
      }
    }
  }

  return word + key;
}

/**
 * Hook xử lý sự kiện onKeyDown vào textarea hoặc input
 */
export function handleVietnameseKeyDown(e, mode, value, onChange) {
  if (mode === 'off') return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key.length !== 1) return;

  const target = e.target;
  const start = target.selectionStart;
  const end = target.selectionEnd;

  if (start === null || end === null || start !== end) return;

  const textBefore = (value || '').substring(0, start);
  const textAfter = (value || '').substring(end);

  const match = textBefore.match(/([a-zA-Z\u00C0-\u1EF9]+)$/);
  if (!match) return;

  const currentWord = match[1];
  const prefix = textBefore.substring(0, textBefore.length - currentWord.length);

  const transformedWord = processVietnameseWord(currentWord, e.key, mode);
  if (transformedWord !== currentWord + e.key) {
    e.preventDefault();
    const newValue = prefix + transformedWord + textAfter;
    onChange(newValue);
    const newCursorPos = (prefix + transformedWord).length;
    setTimeout(() => {
      if (target) {
        target.selectionStart = target.selectionEnd = newCursorPos;
      }
    }, 0);
  }
}
