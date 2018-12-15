import { expireInvitation, getInvitationExpiryCandidates } from 'server/attendance/logic';
import { ApplicationResponseInstance } from 'server/models';
import { createHandler } from './utils';

async function processExpiryQueue(responsesToProcess: ReadonlyArray<ApplicationResponseInstance>, dryRun: boolean) {
  for (const response of responsesToProcess) {
    console.log(`Expiring response ${response.id}. Date invited: ${response.createdAt}`);
    if (dryRun === false) {
      try {
        await expireInvitation(response);
        console.log(`Expired ${response.id}`);
      } catch (error) {
        console.error(`Failed to expire ${response.id}`);
        console.error(error);
      }
    }
  }
}

export default {
  command: 'expire-invitations [--dryRun]',
  desc: 'Take any pending invitations that are too old and expire them',
  aliases: [],
  builder(yargs) {
    return yargs.boolean('dryRun')
      .describe('dryRun', 'Display the candidates for expiry but do not expire them');
  },
  handler: createHandler(({ dryRun }) =>
    getInvitationExpiryCandidates().then(responses => {
      console.log(`${dryRun ? 'Dry run expiring' : 'Expiring'} ${responses.length} invitation${responses.length !== 1 ? 's' : ''}`);
      return processExpiryQueue(responses, dryRun);
    })
  ),
};
