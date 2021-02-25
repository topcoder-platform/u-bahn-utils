
/**
 * Script that takes as input 2 csv files:
 * File 1 - Contains the user's details in Topcoder (handle, first and last name)
 * File 2 - Contains the user's email address provided to Topcoder
 * and ouputs a single csv file, meant to be used with U-Bahn's Bulk Uploader
 */

const { parse } = require('json2csv')
const parseToJson = require('csv-parse/lib/sync')
const fs = require('fs').promises
const path = require('path')
const _ = require('lodash')

/**
 * New etc script
 */
async function newEtl () {
  if (process.argv.length < 5) {
    console.error('usage: node new-etl-script {input1.csv} {input2.csv} {output.csv}')
    return
  }
  const input1 = path.join(__dirname, process.argv[2])
  const input2 = path.join(__dirname, process.argv[3])
  const output = path.join(__dirname, process.argv[4])
  const input1Json = await readCSVFile(input1)
  const input2Json = _.keyBy(await readCSVFile(input2), 'user_id')
  const outputJson = _.map(input1Json, f1 => ({
    handle: f1.handle,
    firstName: f1.first_name,
    lastName: f1.last_name,
    email: input2Json[f1.user_id].address,
    attributeName1: 'isAvailable',
    attributeGroupName1: 'TC Basic',
    attributeValue1: 'true',
    attributeName2: 'company',
    attributeGroupName2: 'TC Basic',
    attributeValue2: 'Topcoder',
    attributeName3: 'location',
    attributeGroupName3: 'TC Basic',
    attributeValue3: '',
    attributeName4: 'title',
    attributeGroupName4: 'TC Basic',
    attributeValue4: 'Member',
    attributeName5: 'email',
    attributeGroupName5: 'TC Basic',
    attributeValue5: input2Json[f1.user_id].address
  }))
  const csv = await getCSV(outputJson)
  await fs.writeFile(output, csv)
}
/**
 * Read from csv file and return an array of objects
 * @param {String} filePath file path to read
 * @returns {Array} an array of objects
 */
async function readCSVFile (filePath) {
  try {
    const content = await fs.readFile(filePath)
    return parseToJson(content, { columns: true, skip_empty_lines: true, delimiter: '\t' })
  } catch (error) {
    console.log('Error parse data to json')
    console.error(error)
    throw error
  }
}

/**
 * Returns CSV string for an array of objects
 * @param {Array} data Array of objects
 * @returns {String} csv string
 */
async function getCSV (data) {
  const columns = [
    'handle',
    'firstName',
    'lastName',
    'email',
    'attributeName1',
    'attributeGroupName1',
    'attributeValue1',
    'attributeName2',
    'attributeGroupName2',
    'attributeValue2',
    'attributeName3',
    'attributeGroupName3',
    'attributeValue3',
    'attributeName4',
    'attributeGroupName4',
    'attributeValue4',
    'attributeName5',
    'attributeGroupName5',
    'attributeValue5'
  ]

  try {
    const csv = parse(data, { fields: columns })
    return csv
  } catch (error) {
    console.log('Error converting data to CSV format')
    console.error(error)
    throw error
  }
}

newEtl().catch(e => console.error(e.message))
