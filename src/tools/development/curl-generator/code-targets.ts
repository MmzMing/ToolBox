import { assembleUrl, base64 } from './build-curl'
import { looksLikeJson } from './parse-curl'
import { createParamRow, type HttpRequestModel } from './request-model'

export type CodeTargetId = 'javascript' | 'python' | 'java' | 'php' | 'go'

export interface CodeTarget {
  readonly id: CodeTargetId
  readonly label: string
  /** highlight.js 语言名 */
  readonly language: string
  generate: (model: HttpRequestModel) => string
}

/** 各语言生成器的共同输入：把认证与请求体摊平成头列表 + 文本，避免五份重复判断 */
export interface Prepared {
  method: string
  url: string
  headers: { name: string; value: string }[]
  body: string
  hasBody: boolean
  bodyIsJson: boolean
}

function quoteSingle(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

function quoteDouble(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`
}

export function prepareRequest(model: HttpRequestModel): Prepared {
  const headers = model.headers
    .filter((header) => header.enabled && header.name.trim() !== '')
    .map((header) => ({ name: header.name, value: header.value }))
  const extraQuery = []
  let body = ''

  switch (model.body.kind) {
    case 'json':
    case 'raw':
      body = model.body.text
      break
    case 'binary':
      body = `@${model.body.path}`
      break
    case 'urlencoded':
      body = model.body.fields
        .filter((field) => field.enabled && field.name.trim() !== '')
        .map((field) => `${field.name}=${field.value}`)
        .join('&')
      break
    case 'form':
      body = model.body.fields
        .filter((field) => field.enabled && field.name.trim() !== '')
        .map((field) => `${field.name}=${field.isFile ? '@' : ''}${field.value}`)
        .join('&')
      break
    default:
      break
  }

  const auth = model.auth
  if (auth.kind === 'basic' || auth.kind === 'digest') {
    const scheme = auth.kind === 'basic' ? 'Basic' : 'Digest'
    headers.push({
      name: 'Authorization',
      value: `${scheme} ${base64(`${auth.user}:${auth.password}`)}`,
    })
  } else if (auth.kind === 'bearer') {
    headers.push({ name: 'Authorization', value: `Bearer ${auth.token}` })
  } else if (auth.kind === 'apikey') {
    if (auth.in === 'header') headers.push({ name: auth.name, value: auth.value })
    else extraQuery.push(createParamRow(auth.name, auth.value))
  }

  return {
    method: model.method || 'GET',
    url: assembleUrl(model, extraQuery),
    headers,
    body,
    hasBody: body !== '',
    bodyIsJson: model.body.kind === 'json' || looksLikeJson(body),
  }
}

function generateJavaScript(model: HttpRequestModel): string {
  const request = prepareRequest(model)
  const options: string[] = [`  method: ${quoteSingle(request.method)}`]
  if (request.headers.length > 0) {
    const entries = request.headers
      .map((header) => `    ${quoteDouble(header.name)}: ${quoteSingle(header.value)}`)
      .join(',\n')
    options.push(`  headers: {\n${entries}\n  }`)
  }
  if (request.hasBody) options.push(`  body: ${quoteSingle(request.body)}`)
  return [
    `const response = await fetch(${quoteSingle(request.url)}, {`,
    `${options.join(',\n')},`,
    '});',
    '',
    `const data = await response.${request.bodyIsJson ? 'json()' : 'text()'};`,
    'console.log(data);',
  ].join('\n')
}

function generatePython(model: HttpRequestModel): string {
  const request = prepareRequest(model)
  const args = [quoteDouble(request.method), quoteDouble(request.url)]
  if (request.headers.length > 0) {
    const entries = request.headers
      .map((header) => `    ${quoteDouble(header.name)}: ${quoteDouble(header.value)}`)
      .join(',\n')
    args.push(`headers={\n${entries}\n}`)
  }
  if (request.hasBody) args.push(`data=${quoteDouble(request.body)}`)
  return [
    'import requests',
    '',
    `response = requests.request(${args.join(', ')})`,
    '',
    'print(response.text)',
  ].join('\n')
}

function generateJava(model: HttpRequestModel): string {
  const request = prepareRequest(model)
  const builder = [
    'HttpRequest request = HttpRequest.newBuilder()',
    `    .uri(URI.create(${quoteDouble(request.url)}))`,
  ]
  for (const header of request.headers) {
    builder.push(`    .header(${quoteDouble(header.name)}, ${quoteDouble(header.value)})`)
  }
  if (request.method === 'GET') builder.push('    .GET()')
  else if (request.method === 'DELETE') builder.push('    .DELETE()')
  else {
    builder.push(
      `    .method(${quoteDouble(request.method)}, HttpRequest.BodyPublishers.ofString(${quoteDouble(request.body)}))`,
    )
  }
  builder.push('    .build();')
  return [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    ...builder,
    '',
    'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    'System.out.println(response.body());',
  ].join('\n')
}

function generatePhp(model: HttpRequestModel): string {
  const request = prepareRequest(model)
  const options = [
    `  CURLOPT_URL => ${quoteDouble(request.url)}`,
    '  CURLOPT_RETURNTRANSFER => true',
    `  CURLOPT_CUSTOMREQUEST => ${quoteDouble(request.method)}`,
  ]
  if (request.headers.length > 0) {
    const entries = request.headers
      .map((header) => `    ${quoteDouble(`${header.name}: ${header.value}`)}`)
      .join(',\n')
    options.push(`  CURLOPT_HTTPHEADER => [\n${entries},\n  ]`)
  }
  if (request.hasBody) options.push(`  CURLOPT_POSTFIELDS => ${quoteDouble(request.body)}`)
  return [
    '$curl = curl_init();',
    '',
    'curl_setopt_array($curl, [',
    `${options.join(',\n')},`,
    ']);',
    '',
    '$response = curl_exec($curl);',
    'curl_close($curl);',
    '',
    'echo $response;',
  ].join('\n')
}

function generateGo(model: HttpRequestModel): string {
  const request = prepareRequest(model)
  const imports = ['"fmt"', '"io"', '"net/http"']
  if (request.hasBody) imports.push('"strings"')
  const lines = ['package main', '', 'import (']
  lines.push(...imports.map((item) => `\t${item}`))
  lines.push(')', '', 'func main() {')
  if (request.hasBody) {
    // Go 的反引号字面量容不下反引号本身，遇到就退回转义双引号串
    const literal = request.body.includes('`')
      ? `strings.NewReader(${quoteDouble(request.body)})`
      : `strings.NewReader(\`${request.body}\`)`
    lines.push(`\tpayload := ${literal}`)
  }
  lines.push(
    `\treq, err := http.NewRequest(${quoteDouble(request.method)}, ${quoteDouble(request.url)}, ${request.hasBody ? 'payload' : 'nil'})`,
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
  )
  for (const header of request.headers) {
    lines.push(`\treq.Header.Add(${quoteDouble(header.name)}, ${quoteDouble(header.value)})`)
  }
  lines.push(
    '\tres, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer res.Body.Close()',
    '\tbody, err := io.ReadAll(res.Body)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '',
    '\tfmt.Println(string(body))',
    '}',
  )
  return lines.join('\n')
}

export const CODE_TARGETS: readonly CodeTarget[] = [
  { id: 'javascript', label: 'JavaScript', language: 'javascript', generate: generateJavaScript },
  { id: 'python', label: 'Python', language: 'python', generate: generatePython },
  { id: 'java', label: 'Java', language: 'java', generate: generateJava },
  { id: 'php', label: 'PHP', language: 'php', generate: generatePhp },
  { id: 'go', label: 'Go', language: 'go', generate: generateGo },
]

export function generateCode(target: CodeTargetId, model: HttpRequestModel): string {
  // 与 buildCurl 一致：没有地址就不产出半成品代码
  if (model.url.trim() === '') return ''
  const found = CODE_TARGETS.find((item) => item.id === target)
  return found === undefined ? '' : found.generate(model)
}
