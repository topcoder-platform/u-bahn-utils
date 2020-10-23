
const _ = require('lodash')
const fs = require('fs').promises
const config = require('config')
const axios = require('axios')
const m2mAuth = require('tc-core-library-js').auth.m2m

const ubahnM2MConfig = _.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL'])
const ubahnM2M = m2mAuth({ ...ubahnM2MConfig, AUTH0_AUDIENCE: ubahnM2MConfig.AUTH0_AUDIENCE })

const url = `https://${config.DOMAIN}/v5/skills`
const skillProviderId = config.SKILLPROVIDERID

async function getUbahnM2Mtoken() {
  return ubahnM2M.getMachineToken(config.AUTH0_CLIENT_ID, config.AUTH0_CLIENT_SECRET)
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createSkill() {
  try {
    const fails = new Array()
    const skillsFile = await fs.readFile(config.FILE_SKILLS)
    const skills = skillsFile.toString().split('\n')
    console.log(`loading ${skills.length} skills to ${skillProviderId}`)
    const token = await getUbahnM2Mtoken()

    for (let i = 0; i < skills.length; i++) {
      const name = skills[i]
      console.log(`${i}: ${name}`)

      try {
        await axios.post(url, {
          skillProviderId,
          name
        }, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      } catch (error) {
        console.log(`Error for skill: '${name}'`)
        console.log(error)
        console.log(error.message)
        fails[fails.length] = { postion: i, name}
      }
      await sleep(config.SLEEP_LENGTH)
    }
  } catch (e) {
    console.log(e)
  }
}

createSkill()