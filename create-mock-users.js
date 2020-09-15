/**
 * ! NOTE - Requires the skills in /data/skills.json to exist
 * ! first in the database
 * 
 * * Creates 2 files
 * * 1-create-users.csv => Upload this first. This will create the users
 * * 2-users-with-skills.csv => Upload this next. This will create 10 skills per previously created user
 */

const fs = require('fs')
const faker = require('faker')
const { parseAsync } = require('json2csv')
const skills = require('./data/skills.json')

const baseUser = {
  // handle
  // firstName
  // lastName
  // email
  countryName: 'India',
  providerType: 'Foo Digital',
  provider: 'Foo Technologies',
  // userId
}

const skillUser = {
  // handle
  skillProviderName: 'EMSI',
  // skillName: ''
}

const buFields = [
  'handle',
  'firstName',
  'lastName',
  'email',
  'countryName',
  'providerType',
  'provider',
  'userId'
]

const suFields = [
  'handle',
  'skillProviderName',
  'skillName'
]

let userCount = 100 // Number of users
let BU = []
let SU = []

while (userCount > 0) {
  userCount--

  const handle = faker.internet.userName()

  const b = {
    handle,
    firstName: faker.name.firstName(),
    lastName: faker.name.lastName(),
    email: faker.internet.exampleEmail(),
    userId: faker.random.alphaNumeric(8)
  }

  BU.push(Object.assign(b, baseUser))

  let skillCount = 10 // number of skills per user

  while (skillCount > 0) {
    skillCount--
  
    const s = {
      handle,
      skillName: faker.random.arrayElement(skills)
    }
    
    SU.push(Object.assign(s, skillUser))
  }
}

(async function start() {
  try {
    const opts1 = { fields: buFields }
    const csv1 = await parseAsync(BU, opts1)

    fs.writeFileSync('1-create-users.csv', csv1)

    const opts2 = { fields: suFields }
    const csv2 = await parseAsync(SU, opts2)

    fs.writeFileSync('2-users-with-skills.csv', csv2)
  } catch (error) {
    console.log('Error generating base users')
    console.error(error)

    throw error
  }
})()
