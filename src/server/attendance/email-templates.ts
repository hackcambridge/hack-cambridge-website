import { MailContent, makeInstruction } from 'server/email';
import * as metadata from 'shared/metadata';
import { TeamMemberDetails } from './team-logic';

function teamKeyFromMember(member: TeamMemberDetails) {
  const slackDetails = member.slackName ? `Slack name: ${member.slackName}` : 'You haven’t signed up for Slack yet!';
  return { [`${member.firstName} ${member.lastName}`]: `${member.email} (${slackDetails})` };
}

export function newTicket({ name }: { name: string }): MailContent {
  return {
    subject: `${name}, we’re looking forward to seeing you at ${metadata.eventTitle}`,
    body: {
      name,
      intro: [
        `You’ve confirmed your place at ${metadata.eventTitle}.`
      ],
      action: [
        makeInstruction({
          instructions: 'All the information about registration, accommodation, travel and more is on your ' +
          'dashboard. Have a good read—there may be some extra steps for you.',
          button: {
            text: 'Go to my dashboard',
            link: 'https://hackcambridge.com/apply/dashboard',
          },
        })
      ],
      outro: 'If you have any questions or concerns, don’t hesitate to get in touch by replying to this email.',
    },
  };
}

export function expiry({ name, daysValid }: { name: string, daysValid: number }): MailContent {
  return {
    subject: `Your ${metadata.title} invitation has expired`,
    body: {
      name,
      intro: [
        `Earlier we sent you an invitation to ${metadata.eventTitle} with ${daysValid} days to respond. ` +
        'We have not received a response from you and your invitation has expired.',
        `We hope to see you apply for the next ${metadata.title}!`
      ],
      outro: 'If you have any questions, don’t hesitate to get in touch by replying to this email.',
    }
  };
}

export function teamAllocation({ team }: { team: TeamMemberDetails[] }): MailContent {
  const teamDictionary = team.reduce((partialTeam, member) =>
    Object.assign(partialTeam, teamKeyFromMember(member)),
  { }
  );

  return {
    subject: `We’ve put a team together for you for ${metadata.title}`,
    body: {
      name: 'Hackers',
      intro: [
        `When you applied for ${metadata.title}, you let us know that you wanted us to suggest a team for you.`,
        'We’ve done this now, and here are everyone’s details:',
      ],
      dictionary: teamDictionary,
      outro: [
        'Start the conversation by hitting reply all! Please exclude us from that email.',
        `This is just a suggestion, it is not binding, you can enter whatever team you like at ${metadata.title}.`,
        'If you have any questions, please don’t hesitate to get in touch by replying to this email.',
      ]
    }
  };
}
