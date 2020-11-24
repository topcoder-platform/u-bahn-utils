/**
 * Purpose is same as update-groups.js => To copy groups info from groups
 * api to ubahn. However, approach is different:
 * - Read all users in ubahn first
 * - Get their topcoder user ids
 * - Use the user ids to get the group associations in groups api
 * - Copy the associations into ubahn
 *
 * Run the script with `node update-groups-v2.js`
 */
const _ = require('lodash')
const config = require('config')
const axios = require('axios')
const m2mAuth = require('tc-core-library-js').auth.m2m
const elasticsearch = require('@elastic/elasticsearch')

const ubahnM2MConfig = _.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL'])
const topcoderM2MConfig = _.pick(config, ['AUTH0_URL', 'AUTH0_TOPCODER_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL'])

const ubahnM2M = m2mAuth({ ...ubahnM2MConfig, AUTH0_AUDIENCE: ubahnM2MConfig.AUTH0_AUDIENCE })

const topcoderM2M = m2mAuth({ ...topcoderM2MConfig, AUTH0_AUDIENCE: topcoderM2MConfig.AUTH0_TOPCODER_AUDIENCE })

let esClient

async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get M2M token.
 * @returns {Promise<unknown>}
 */
async function getTCM2MToken () {
  return topcoderM2M.getMachineToken(config.AUTH0_CLIENT_ID, config.AUTH0_CLIENT_SECRET)
}

/**
 * Returns m2m token for use with ubahn's apis
 */
async function getUbahnM2Mtoken () {
  return ubahnM2M.getMachineToken(config.AUTH0_CLIENT_ID, config.AUTH0_CLIENT_SECRET)
}

/**
 * Returns all groups associated with the member
 * @param {String} memberId The member id
 */
async function getGroupsOfUser (memberId) {
  const membershipType = 'user'
  const url = `${config.GROUPS_API_URL}`
  const perPage = 12
  let page = 1
  const groups = []
  let once = false

  const token = await getTCM2MToken()

  while (true) {
    try {
      const res = await axios.get(url, {
        params: {
          page,
          perPage,
          memberId,
          membershipType
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!once) {
        const total = res.headers['x-total']
        console.log(`Discovered ${total} groups...`)

        if (total > 0) {
          console.log('Fetching all of them...')
        }

        once = true
      }

      if (res.data.length > 0) {
        groups.push(...res.data)
      }

      if (res.data.length !== perPage) {
        break
      }

      page += 1
    } catch (error) {
      console.log(`Error when fetching groups at page ${page} and per page ${perPage} for member ${memberId}`)
      console.log(error)

      throw error
    }
  }

  return groups
}

/**
 * Returns all users in ubahn
 */
async function getAllUbahnUsers () {
  const perPage = 12
  let page = 1
  const users = []
  let once = false

  const token = await getUbahnM2Mtoken()

  while (true) {
    try {
      const res = await axios.get(config.UBAHN_USERS_API_URL, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          page,
          perPage
        }
      })

      if (!once) {
        const total = res.headers['x-total']
        console.log(`Discovered ${total} user(s) in ubahn...`)

        if (total > 0) {
          console.log('Fetching all of them...')
        }

        once = true
      }

      if (res.data.length > 0) {
        users.push(...res.data)
      }

      if (res.data.length !== perPage) {
        break
      }

      page += 1
    } catch (error) {
      console.log(`Error when fetching users in ubahn at page ${page} and per page ${perPage}`)
      console.log(error)

      throw error
    }
  }

  return users
}

/**
 * Returns the external profile of the user
 * @param {String} userId The ubahn user id
 */
async function getExternalProfile (userId) {
  const url = `${config.UBAHN_USERS_API_URL}/${userId}/externalProfiles`
  const token = await getUbahnM2Mtoken()
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    return res.data
  } catch (error) {
    console.log(`Error fetching the external profile of user with id ${userId}`)
    console.log(error)

    throw error
  }
}

/**
 * Returns the Elasticsearch client
 */
async function getESClient () {
  if (esClient) {
    return esClient
  }
  const host = config.ES.HOST
  const cloudId = config.ES.ELASTICCLOUD.id
  if (!esClient) {
    if (cloudId) {
      // Elastic Cloud configuration
      esClient = new elasticsearch.Client({
        cloud: {
          id: cloudId
        },
        auth: {
          username: config.ES.ELASTICCLOUD.username,
          password: config.ES.ELASTICCLOUD.password
        }
      })
    } else {
      esClient = new elasticsearch.Client({
        node: host
      })
    }
  }
  return esClient
}

/**
 * Updates the groups in the user
 * @param {String} userId The user id
 * @param {Array} groups The array of groups
 */
async function updateGroupsForUser (userId, groups) {
  const client = await getESClient()
  const { body: user } = await client.getSource({
    index: config.get('ES.USER_INDEX'),
    type: config.get('ES.USER_TYPE'),
    id: userId
  })

  const propertyName = config.get('ES.USER_GROUP_PROPERTY_NAME')
  // if (!user[propertyName]) {
  //   user[propertyName] = []
  // }

  // let groupsTotal = user[propertyName].concat(groups)

  // groupsTotal = _.uniqBy(groupsTotal, (g) => g.id)

  user[propertyName] = _.uniqBy(groups, (g) => g.id)

  await client.index({
    index: config.get('ES.USER_INDEX'),
    type: config.get('ES.USER_TYPE'),
    id: userId,
    body: user,
    refresh: 'wait_for',
    pipeline: config.get('ES.USER_PIPELINE_ID')
  })
}

/**
 * Main function
 */
async function start () {
  // Get all users in ubahn
  const users = await getAllUbahnUsers()
  const final = {}

  for (let i = 0; i < users.length; i++) {
    const userId = users[i].id

    console.log(`Getting external profile of user with id ${userId}`)

    // Get external profiles of the user (to get the tc member ids of the ubahn users)
    let externalProfiles = await getExternalProfile(userId)

    externalProfiles = _.uniqBy(externalProfiles, (e) => e.externalId)

    // Get groups of the user
    for (let j = 0; j < externalProfiles.length; j++) {
      const memberId = externalProfiles[j].externalId
      console.log(`Getting groups of user with id ${memberId}`)
      let groups = await getGroupsOfUser(memberId)
      groups = groups.map(g => ({ id: g.id, name: g.name }))

      if (groups.length > 0) {
        if (!final[userId]) {
          final[userId] = groups
        } else {
          final[userId] = final[userId].concat(groups)
        }
      }
    }
  }

  const keys = Object.keys(final)

  for (let i = 0; i < keys.length; i++) {
    await updateGroupsForUser(keys[i], final[keys[i]])
    await sleep()
  }

  console.log('All groups copied over to ubahn as relevant')
}

start()
