import {
  createEmptyModel,
  createEncodedFieldRow,
  createFormFieldRow,
  createHeaderRow,
  createOption,
  createParamRow,
  type HttpRequestModel,
} from './request-model'

export interface Preset {
  readonly id: string
  readonly build: () => HttpRequestModel
}

/** 首次进入时不至于对着空表单发呆；每个示例都覆盖一类常见 API 形状 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'restCreate',
    build: () => ({
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://api.example.com/v1/users',
      headers: [
        createHeaderRow('Accept', 'application/json'),
        createHeaderRow('Content-Type', 'application/json'),
      ],
      body: { kind: 'json', text: '{\n  "name": "Ada",\n  "role": "admin"\n}' },
    }),
  },
  {
    id: 'authDownload',
    build: () => ({
      ...createEmptyModel(),
      url: 'https://api.example.com/files/report.pdf',
      query: [createParamRow('version', 'latest')],
      auth: { kind: 'bearer', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', via: 'header' },
      options: [createOption('-L', undefined, true), createOption('-o', 'report.pdf', true)],
    }),
  },
  {
    id: 'multipartUpload',
    build: () => ({
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://api.example.com/upload',
      body: {
        kind: 'form',
        fields: [
          createFormFieldRow('file', '/Users/me/Desktop/report.pdf', true),
          createFormFieldRow('note', 'quarterly report'),
        ],
      },
    }),
  },
  {
    id: 'graphql',
    build: () => ({
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://api.example.com/graphql',
      headers: [createHeaderRow('Content-Type', 'application/json')],
      body: {
        kind: 'json',
        text: '{\n  "query": "query { viewer { login } }"\n}',
      },
    }),
  },
  {
    id: 'formLogin',
    build: () => ({
      ...createEmptyModel(),
      method: 'POST',
      url: 'https://api.example.com/oauth/token',
      headers: [createHeaderRow('Content-Type', 'application/x-www-form-urlencoded')],
      body: {
        kind: 'urlencoded',
        fields: [
          createEncodedFieldRow('grant_type', 'authorization_code', false),
          createEncodedFieldRow('code', 'SplxlOBeZQQYbYS6WxSbIA', false),
          createEncodedFieldRow('redirect_uri', 'https://example.com/cb', true),
        ],
      },
    }),
  },
]
