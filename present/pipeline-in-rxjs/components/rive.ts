import { RiveFile } from '@rive-app/canvas'

const fileMap = new Map<string, Promise<RiveFile>>()


export const loadRiveFile = async (src: string): Promise<RiveFile> => {
  if (fileMap.has(src)) {
    return fileMap.get(src)!
  }

  const loading = new Promise<RiveFile>(async (resolve) => {
    const riveFile = new RiveFile({
      src,
    })
    await riveFile.init()
    resolve(riveFile)
  })
  fileMap.set(src, loading)
  return loading
}
