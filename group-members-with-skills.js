/**
 * Script that:
 * - reads members in a group
 * - reads skills of the earlier members
 * - prepares a CSV file
 * for bulk upload to U-Bahn
 *
 * ! NOTE: Set the environment variables in the .env file.
 * ! The list of environment variables can be found in the config/default.js file
 *
 * Usage:
 * $ node group-members-with-skills.js --groupName="Night Owls" --skillProviderName="EMSI" --attributeGroupName="group 03"
 *
 * where
 * - groupName: Name of the group from which we need to fetch members
 * - skillProviderName: The skill provider name to be used for the skills associated with the members
 * - attributeGroupName: The attribute group name under which the primary attributes are created (isAvailable, location, company and title)
 */

//require('dotenv').config()
const _ = require('lodash')
const config = require('config')
const { argv } = require('yargs')
const axios = require('axios')
const m2mAuth = require('tc-core-library-js').auth.m2m
const qs = require('querystring');
const { parse } = require('json2csv')
const fs = require('fs')

const m2m = m2mAuth(_.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_PROXY_SERVER_URL']))

const USAGE = 'node group-members-with-skills.js --groupName="<group_name>" --skillProviderName="<skillprovider_name>" --attributeGroupName="<attribute_group_name>". Don\'t forget the quotes for the values.'

let token

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get M2M token.
 * @returns {Promise<unknown>}
 */
async function getM2Mtoken () {
  if (!token) {
    console.log(config)
    token = m2m.getMachineToken(config.AUTH0_CLIENT_ID, config.AUTH0_CLIENT_SECRET)
  }

  return token
}

/**
 * Searches for the group details with the given group name
 * @param {String} groupName The group name
 */
async function getGroupIdFromname (groupName) {
  const token = await getM2Mtoken()

  try {
    const res = await axios.get(config.GROUPS_API_URL, {
      params: {
        name: groupName
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    return res.data
  } catch (error) {
    console.log(`Error when fetching group id for name ${groupName}`)
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

  const token = await getM2Mtoken()

  while (true) {
    try {
      const res = await axios.get(url, {
        params: {
          page,
          perPage,
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
        console.log(res.data)
        members.push(...res.data)
      }

      if (res.data.length !== perPage) {
        break
      }

      page += 1
    } catch (error) {
      console.log(`Error when fetching members in group with id ${groupId} at page ${page} and per page ${perPage}`)
      console.log(error)

      throw error
    }
  }

  return members
}

/**
 * Returns the member handle for the member id
 * @param {Number} memberId The member id
 */
async function getMemberRecord (memberId) {
  const token = await getM2Mtoken()

  try {
    const res = await axios.get(config.USERS_API_URL, {
      params: {
        filter: `id=${memberId}`
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    console.log(res.data.result.content)
    const user = _.pick(_.get(res, 'data.result.content[0]', {}), ['handle', 'firstName', 'lastName', 'email'] )

    return user
  } catch (error) {
    console.log(`Error getting the member handle for member with id ${memberId}`)
    console.log(error)

    throw error
  }
}

/**
 * Returns the member location for the member handle
 * @param {String} handle The member handle
 */
async function getMemberLocation(handle) {
  const token = await getM2Mtoken()

  try {
    const res = await axios.get(`${config.MEMBERS_API_URL}/${qs.escape(handle)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    console.log(res.data)
    const location = _.pick(_.get(res, 'data[0]', {}), ['homeCountryCode', 'competitionCountryCode'])

    return location.homeCountryCode || location.competitionCountryCode || 'n/a'
  } catch (error) {
    console.log(`Error getting the member location for member with handle: ${handle}`)
    console.log(error)

    throw error
  }
}

/**
 * Returns the member's skills
 * @param {String} handle The member's handle
 */
async function getMemberSkills (handle) {
  const url = `${config.MEMBERS_API_URL}/${qs.escape(handle)}/skills`

  const token = await getM2Mtoken()

  try {
    const res = await axios.get(url, {
      params: {
        fields: 'skills'
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const { skills } = res.data

    const skillDetails = Object.keys(skills).map(key => ({
      name: skills[key].tagName,
      score: skills[key].score
    }))

    return skillDetails
  } catch (error) {
    if (error.response.status === 404) {
      // No skills exist for the user
      return []
    }

    console.log(`Error getting the member's skills for member with handle ${handle}`)
    console.log(error)

    throw error
  }
}

/**
 * Returns CSV string for an array of objects
 * @param {Array} data Array of objects
 */
async function getCSV (data) {
  const columns = [
    'handle',
    'firstName',
    'lastName',
    'email',
    'skillProviderName',
    'skillName',
    'metricValue',
    'attributeName1',
    'attributeGroupName1',
    'attributeValue1',
    'attributeName1',
    'attributeGroupName2',
    'attributeValue2',
    'attributeName2',
    'attributeGroupName3',
    'attributeValue3',
    'attributeName3',
    'attributeGroupName4',
    'attributeValue4',
  ]

  try {
    const csv = parse(data, { fields: columns })

    return csv
  } catch (error) {
    console.log('Error converting data to CSV format')
    console.log(error)

    throw error
  }
}

async function start () {
  const users = []
  const usersWithSkills = []
  const { groupName, skillProviderName, attributeGroupName } = argv

  if (!groupName) {
    console.log(`Missing group name. Correct usage: ${USAGE}`)
    return
  } else if (!skillProviderName) {
    console.log(`Missing skill provider name. Correct usage: ${USAGE}`)
    return
  } else if (!attributeGroupName) {
    console.log(`Missing attribute group name. Correct usage: ${USAGE}`)
    return
  }

  console.log(`Searching for id of group named ${groupName}...`)

  const groups = await getGroupIdFromname(groupName)

  if (groups.length !== 1) {
    console.log(`There are ${groups.length} groups with that name. Aborting`)
    return
  }

  const { id: groupId } = groups[0]

  console.log(`Group found with id ${groupId}. Fetching members in this group...`)

  const members = await getMembersInGroup(groupId)

  if (members.length === 0) {
    console.log(`There are no members in group with name ${groupName}, having group id ${groupId}. Aborting`)

    return
  }

  console.log('Fetching the member handles for each member found in the group...')

  const membersFiltered = _.filter(members, (m) => {
    return (m.membershipType === 'user') 
  })

  memberIds = membersFiltered.map(m => m.memberId)
  //const memberIds = [8547899]

  for (let i = 0; i < memberIds.length; i++) {
    const user = await getMemberRecord(memberIds[i])
    console.log(`pushing '${user.handle}' into stack`)
    users.push(user)
    console.log(`throttling call for ${config.SLEEP_LENGTH}s`)
    await sleep(config.SLEEP_LENGTH)
  }

  console.log('Fetching the skills for each member...')

  for (let i = 0; i < users.length; i++) {
    const handle = users[i].handle
    const location = await getMemberLocation(handle)
    const skills = await getMemberSkills(handle)

    if (skills.length === 0) {
      console.log(`Member with handle ${handle} has no skills. Skipping...`)
      continue
    }

    for (let j = 0; j < skills.length; j++) {
      usersWithSkills.push({
        handle,
        firstName: users[i].firstName,
        lastName: users[i].lastName,
        email: users[i].email,
        attributeName1: 'isAvailable',
        attributeGroupName1: attributeGroupName,
        attributeValue1: 'true',
        attributeName2: 'company',
        attributeGroupName2: attributeGroupName,
        attributeValue2: 'Topcoder',
        attributeName3: 'location',
        attributeGroupName3: attributeGroupName,
        attributeValue3: location,
        attributeName4: 'title',
        attributeGroupName4: attributeGroupName,
        attributeValue4: 'Member',
        skillProviderName,
        skillName: skills[j].name,
        metricValue: '' + skills[j].score
      })
    }
  }

  console.log('Converting data to CSV...')

  const csv = await getCSV(usersWithSkills)

  console.log('Saving CSV data to file...')

  const date = (new Date()).toISOString()

  fs.writeFileSync(`skill-data-${date}.csv`, csv)

  console.log(`File skill-data-${date}.csv generated successfully.`)
  console.log('~~FIN~~')
}

start()
