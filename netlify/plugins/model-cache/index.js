// Netlify build plugin: caches the downloaded model files between builds.
const MODELS_DIR = 'public/models'

export const onPreBuild = async ({ utils }) => {
  if (await utils.cache.restore(MODELS_DIR)) {
    console.log(`Restored ${MODELS_DIR} from the build cache`)
  }
}

export const onPostBuild = async ({ utils }) => {
  if (await utils.cache.save(MODELS_DIR)) {
    console.log(`Saved ${MODELS_DIR} to the build cache`)
  }
}
