// eslint.config.js — 에이전트 방어용 엄격 설정 (ESLint 9 flat config, ESM)
//
// 설치:
//   npm i -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks globals
//
// 이 파일은 gate.js 의 보호 대상이다. 규칙을 바꾸려면 사람이 `gate.js unlock` → 수정 → `gate.js lock`.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const NEW_REF_METHODS =
  '^(map|filter|reduce|flatMap|sort|slice|concat|toSorted|toReversed|toSpliced|flat|entries|keys|values)$';
const STORE_HOOK = "CallExpression[callee.name=/^use[A-Za-z0-9]*Store$/][arguments.length=1]";

const restrictedSyntax = [
  // ── React / Zustand 무한 루프 ─────────────────────────────────────────
  {
    selector: `CallExpression[callee.name='useShallow'] CallExpression[callee.property.name=/${NEW_REF_METHODS}/]`,
    message:
      '[무한루프] useShallow 셀렉터 안에서 배열 변환(map/filter/…) 금지. 셀렉터는 스토어의 원본 참조만 반환하고, 변환은 컴포넌트에서 useMemo 로 하세요.',
  },
  {
    selector: `${STORE_HOOK} > ArrowFunctionExpression > CallExpression[callee.property.name=/${NEW_REF_METHODS}/]`,
    message:
      '[무한루프] 스토어 셀렉터가 매 호출마다 새 배열을 반환합니다(Zustand v5 에서 Maximum update depth). 원본 참조를 선택하고 변환은 useMemo 로.',
  },
  {
    selector: `${STORE_HOOK} > ArrowFunctionExpression > :matches(ObjectExpression, ArrayExpression)`,
    message:
      '[무한루프] 스토어 셀렉터가 매번 새 객체/배열 리터럴을 반환합니다. 단일 값을 선택하거나 useShallow 로 감싸세요.',
  },
  {
    selector: `${STORE_HOOK} > ArrowFunctionExpression > BlockStatement > ReturnStatement > :matches(ObjectExpression, ArrayExpression)`,
    message:
      '[무한루프] 스토어 셀렉터가 매번 새 객체/배열 리터럴을 반환합니다. 단일 값을 선택하거나 useShallow 로 감싸세요.',
  },
  {
    selector:
      "CallExpression[callee.name=/^use(Layout)?Effect$/][arguments.length=1], CallExpression[callee.object.name='React'][callee.property.name=/^use(Layout)?Effect$/][arguments.length=1]",
    message: '[무한루프] useEffect/useLayoutEffect 에 의존성 배열이 없습니다. 매 렌더마다 실행되어 setState 와 결합하면 무한 루프가 됩니다.',
  },
  // ── 가짜 완성(스텁) ───────────────────────────────────────────────────
  {
    selector: ':function > BlockStatement[body.length=0]',
    message: '[가짜 완성] 빈 함수 본문 금지(주석만 있어도 불가). 핸들러는 실제 상태 변경/호출까지 구현하세요.',
  },
  {
    selector: 'ThrowStatement > NewExpression > Literal[value=/not implemented|unimplemented|미구현/i]',
    message: '[가짜 완성] 미구현 throw 금지.',
  },
  {
    selector: 'Literal[value=/lorem ipsum|coming soon|not implemented|미구현|구현 예정|추후 구현/i]',
    message: '[가짜 완성] 더미/미구현 문자열 금지.',
  },
  {
    selector: 'JSXText[value=/lorem ipsum|coming soon|not implemented|미구현|구현 예정|추후 구현/i]',
    message: '[가짜 완성] 화면에 더미/미구현 문구 금지.',
  },
];

export default [
  { ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', 'src-tauri/target/**', 'src-tauri/gen/**'] },

  // eslint-disable 주석 자체를 무력화한다. (무시된 지시문은 경고로 보고되어 --max-warnings 0 에서 실패)
  { linterOptions: { noInlineConfig: true } },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // 미완성 표식 (주석)
      'no-warning-comments': [
        'error',
        {
          terms: [
            'todo', 'fixme', 'hack', 'xxx', 'stub', 'placeholder', 'wip',
            'not implemented', 'implement later',
            '나중에', '연결 필요', '구현 예정', '추후', '미구현', '임시 구현',
          ],
          location: 'anywhere',
        },
      ],
      'no-restricted-syntax': ['error', ...restrictedSyntax],

      // 빈 껍데기 / 디버그 잔재
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false }],

      // React 렌더링 안정성
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/jsx-key': 'error',
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-constructed-context-values': 'error',
      'react/no-direct-mutation-state': 'error',
    },
  },

  // 테스트: 모킹용 빈 함수 등을 허용 (인수 테스트는 어차피 사람이 작성·잠금)
  {
    files: ['tests/**/*.{ts,tsx,js,jsx}', '**/*.{test,spec}.{ts,tsx,js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
      'no-warning-comments': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // 도구 스크립트/설정 파일
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}', '*.config.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
      'no-warning-comments': 'off',
      'no-empty': 'off',
    },
  },
];
