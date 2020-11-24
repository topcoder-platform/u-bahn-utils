/**
 * Script that reads groups and their members, and updates the group info in ubahn
 * for that member
 * - Reads all groups
 * - Reads all members in that group
 * - Updates the group association for that member in Ubahn
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
 * Returns the member handle for the member id
 * @param {Number} memberId The member id
 */
async function getMemberRecord (memberId) {
  const token = await getTCM2MToken()

  try {
    const res = await axios.get(config.USERS_API_URL, {
      params: {
        filter: `id=${memberId}`
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const user = _.pick(_.get(res, 'data.result.content[0]', {}), ['handle'])

    return user
  } catch (error) {
    if (error.response.status === 400) {
      console.log(`Error getting the member handle for member with id ${memberId}`)
      return {}
    }
    console.log(`Error getting the member handle for member with id ${memberId}`)
    console.log(error)

    throw error
  }
}

/**
 * Returns members in the group identified by the groupId
 * @param {String} groupId The group id
 */
async function getMembersInGroup (groupId) {
  const url = `${config.GROUPS_API_URL}/${groupId}/members`
  const perPage = 12
  let page = 1
  const members = []
  let once = false

  const token = await getTCM2MToken()

  while (true) {
    try {
      const res = await axios.get(url, {
        params: {
          page,
          perPage
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!once) {
        const total = res.headers['x-total']
        console.log(`Discovered ${total} members in the group...`)

        if (total > 0) {
          console.log('Fetching all of them...')
        }

        once = true
      }

      if (res.data.length > 0) {
        members.push(...res.data)
      }

      if (res.data.length !== perPage) {
        break
      }

      page += 1
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`Error when fetching the members in group ${groupId}. Status is 404.`)
        break
      }

      console.log(`Error when fetching members in group with id ${groupId} at page ${page} and per page ${perPage}`)
      console.log(error)

      throw error
    }
  }

  return members
}

/**
 * Returns all groups
 */
async function getAllGroups () {
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
          perPage
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
      console.log(`Error when fetching groups at page ${page} and per page ${perPage}`)
      console.log(error)

      throw error
    }
  }

  return groups
}

/**
 * Returns the user's details in ubahn
 * @param {String} handle The member's handle
 */
async function getUbahnUser (handle) {
  const token = await getUbahnM2Mtoken()
  try {
    const res = await axios.get(config.UBAHN_USERS_API_URL, {
      params: {
        handle
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    return res.data
  } catch (error) {
    console.log(`Error getting the user details from ubahn with handle ${handle}`)
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
  const groups = await getAllGroups()
  const final = {}

  for (let i = 0; i < groups.length; i++) {
    // Get all members in the group(s)
    const mg = await getMembersInGroup(groups[i].id)

    const mem = _.filter(mg, (m) => {
      return (m.membershipType === 'user')
    })

    console.log(`${mem.length} members in the group will be processed now`)

    for (let j = 0; j < mem.length; j++) {
      const memberId = mem[j].memberId

      // eslint-disable-next-line prefer-const
      let { handle } = await getMemberRecord(memberId)

      if (!handle) {
        console.log(`Could not find handle of user ${memberId}`)
        continue
      }

      const ubahnuser = await getUbahnUser(handle)

      if (!ubahnuser || ubahnuser.length === 0 || ubahnuser[0].handle !== handle) {
        // Ignore users that do not exist in ubahn
        console.log('Ignoring user since it is not found in ubahn')
        continue
      }

      if (!final[ubahnuser[0].id]) {
        final[ubahnuser[0].id] = []
      }

      final[ubahnuser[0].id].push({
        id: groups[i].id,
        name: groups[i].name
      })
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
