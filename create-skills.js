
const fs = require('fs').promises
const config = require('config')
const axios = require('axios')

const url = `https://${config.DOMAIN}/v5/skills`
const skillProviderId = config.SKILLPROVIDERID

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createSkill() {
  try {
    const skillsFile = await fs.readFile(config.FILE_SKILLS)
    const skills = skillsFile.toString().split('\n')
    console.log(`loading ${skills.length} skills to ${skillProviderId}`)

    for (let i = 0; i < skills.length; i++) {
      const name = skills[i]
      console.log(`${i}: ${name}`)

      try {
        await axios.post(url, {
          skillProviderId,
          name
        }, {
          headers: {
            Authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1rWTNNamsxTWpNeU5Ua3dRalkzTmtKR00wRkZPRVl3TmtJd1FqRXlNVUk0TUVFNE9UQkZOZyJ9.eyJodHRwczovL3RvcGNvZGVyLmNvbS9jbGFpbXMvdXNlcklkIjoiMjMxMjQzMjkiLCJodHRwczovL3RvcGNvZGVyLmNvbS9jbGFpbXMvZW1haWwiOiJjYWxsbWVrYXRvb3RpZUBvdXRsb29rLmNvbSIsImh0dHBzOi8vdG9wY29kZXIuY29tL2NsYWltcy9oYW5kbGUiOiJjYWxsbWVrYXRvb3RpZSIsImh0dHBzOi8vdG9wY29kZXIuY29tL2NsYWltcy9yb2xlcyI6WyJjb3BpbG90IiwiVG9wY29kZXIgVXNlciIsIkNvbm5lY3QgQ29waWxvdCIsInUtYmFobiJdLCJodHRwczovL3RvcGNvZGVyLmNvbS9jbGFpbXMvbmlja25hbWUiOiJjYWxsbWVrYXRvb3RpZSIsImlzcyI6Imh0dHBzOi8vdG9wY29kZXIuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDIzMTI0MzI5IiwiYXVkIjpbImh0dHBzOi8vdS1iYWhuLnRvcGNvZGVyLmNvbSIsImh0dHBzOi8vdG9wY29kZXIuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTU5ODk2NzU2OCwiZXhwIjoxNTk5MDUzOTY4LCJhenAiOiJOa1NTMU5LYzVoZldpMEU1OFZqUU1GNzAwZ1ZBRmlJQyIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwifQ.ioXTj6ictza6iAHlhtYEJGjDlaqttEx65RmM28O5sxoPzAyaHcPxX8rYlBMFhIfBuHFcGi3SI8kQUbnxikGkEeAio9UmejKyNogrwPBWmePTeP9J6NwF-a1f_Pnib-Jr2-Qox9QmGSZL9Ilkxls5Kh5RHtmOmFoKvD6uQOD5ov9IaEJEXvKw4lhy1-FAQKr_-1GT1rhjEEd7LxNsEtSur_wyTWE1tsLMjkBm9R9ZY_yzLN9NZYLP6j6-jOG4OQSoF1dmrCbRQPV9ZOtfEyUDBV3VvXqe-00K1txNOyV9IQgQ1FMIDf9g1bd2s9oC6lBKghScobml7RpSDPESOddZqg'
          }
        })
      } catch (error) {
        console.log('Error for ', name)
        console.log(error)
      }
      await sleep(3000)
    }
  } catch (e) {
    console.log(e)
  }
}

createSkill()