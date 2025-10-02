declare global { interface Window { Babel: any } }

export async function compileTsxCode(tsxCode: string): Promise<string> {
  if (!window.Babel) {
    throw new Error('Babel not loaded. Please ensure https://unpkg.com/@babel/standalone/babel.min.js is loaded.')
  }
  try {
    try {
      console.log('CodeSlideRuntime: compileTsxCode → input preview', {
        codeHead: (tsxCode || '').slice(0, 160),
        length: (tsxCode || '').length
      })
    } catch {}
    const result = window.Babel.transform(tsxCode, {
      filename: 'component.tsx',
      sourceType: 'script',
      presets: [
        ['env', { modules: 'commonjs' }],
        ['react', { runtime: 'classic', pragma: 'React.createElement', pragmaFrag: 'React.Fragment' }],
        ['typescript', { isTSX: true, allExtensions: true }],
      ],
    })
    try { console.log('CodeSlideRuntime: compileTsxCode → compiled length', { length: (result?.code || '').length }) } catch {}
    return result.code
  } catch (error: any) {
    throw new Error(`Compilation failed: ${error.message || String(error)}`)
  }
}


