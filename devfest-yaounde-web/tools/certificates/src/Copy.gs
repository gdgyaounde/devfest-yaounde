/* ---------------------------------------------------------------------------
 * The words, per role: what the certificate says and what the email says.
 *
 * These are only the DEFAULTS written into a new edition's Settings column
 * (role_*, line_*, subject_*, title_*, message_*, ps_*). Organisers reword
 * them in the sheet; nothing here needs editing to change a sentence.
 *
 * Voice: friends who build things. Warm, a little cheeky, always grateful.
 * Each role gets its own thank-you, because each one gave something
 * different. French uses "tu" (the community's register), except partners,
 * who get "vous".
 *
 * In a message, a blank line starts a new paragraph. Every {{placeholder}}
 * works (see Util.gs → placeholderValues_). The line_* are written for the
 * certificate ("pour son engagement"); the email speaks to the person
 * ("pour ton engagement"), so messages say it in their own words.
 * ------------------------------------------------------------------------- */

const ROLE_COPY_ = {
  attendee: {
    label: "Attendee",
    line_fr: "pour avoir pris part au {{event_name}}, avec curiosité et enthousiasme",
    line_en: "for taking part in {{event_name}} with curiosity and enthusiasm",
    subject: "🎓 {{first_name}}, ton certificat est là · Your {{event_name}} certificate is here",
    title_fr: "Tu étais là. Et ça compte.",
    title_en: "You showed up. That matters.",
    message_fr: [
      "Salut {{first_name}}, on dit quoi ?",
      "Tu aurais pu faire la grasse matinée, rattraper ta série ou enfin répondre à ce message de l'an dernier. À la place, tu es venu·e au {{event_name}} : tu as écouté, posé des questions, rencontré du monde, et probablement bu plus de café que ton médecin ne le recommande. On ne juge pas.",
      "Ton certificat est en pièce jointe : il salue ta curiosité et ton enthousiasme. Il est officiel, il est à ton nom, et franchement, il a de l'allure. Ta famille sera fière. Ton LinkedIn aussi.",
    ],
    message_en: [
      "Hey {{first_name}}!",
      "You could have slept in, caught up on your series, or finally answered that message from last year. Instead you came to {{event_name}}: you listened, asked questions, met people, and probably drank more coffee than your doctor would recommend. No judgement.",
      "Your certificate is attached, honouring your curiosity and your enthusiasm. It's official, it has your name on it, and frankly, it looks good. Your family will be proud. So will your LinkedIn.",
    ],
    ps_fr: "P.S. Les slides que tu as promis de relire « ce week-end » t'attendent toujours. Nous aussi, à la prochaine édition.",
    ps_en: "P.S. Those slides you promised to go through \"this weekend\" are still waiting for you. So are we, at the next edition.",
    story_fr: "Une dernière chose : le DevFest Yaoundé t'a-t-il déjà appris quelque chose, fait rencontrer quelqu'un, donné envie de te lancer ? Cette année ou les précédentes, raconte-le-nous en quelques mots, anonymement. Promis, on ne cherchera pas qui a écrit « le Wi-Fi était meilleur avant ».",
    story_en: "One last thing: has DevFest Yaoundé ever taught you something, introduced you to someone, or pushed you to start something? This year or any year before, tell us in a few words, anonymously. We promise not to hunt down whoever writes \"the Wi-Fi was better before\".",
  },

  speaker: {
    label: "Speaker",
    line_fr: "pour avoir partagé son savoir et inspiré la communauté au {{event_name}}",
    line_en: "for sharing their knowledge and inspiring the community at {{event_name}}",
    subject: "🎤 Merci d'avoir pris le micro, {{first_name}} · Thank you for taking the stage",
    title_fr: "Tu as pris le micro. Respect.",
    title_en: "You took the mic. Respect.",
    message_fr: [
      "Salut {{first_name}} !",
      "Monter sur scène devant une salle pleine de développeurs (qui ont tous un avis, sur tout), ce n'est pas rien. Tu l'as fait. Tu as partagé ce que tu sais, et des gens sont repartis avec des idées plein la tête… et des photos floues de tes slides.",
      "Ton certificat est en pièce jointe, pour avoir partagé ton savoir et inspiré toute une communauté. Merci pour ton temps, ton énergie, et les quelques nuits de sommeil sacrifiées à préparer tout ça. On sait. On a vu l'heure de tes messages.",
    ],
    message_en: [
      "Hi {{first_name}}!",
      "Getting on stage in front of a room full of developers (who all have opinions, about everything) is no small thing. You did it. You shared what you know, and people left with their heads full of ideas… and blurry photos of your slides.",
      "Your certificate is attached, for sharing your knowledge and inspiring a whole community. Thank you for your time, your energy, and the nights of sleep you gave up getting it all ready. We know. We saw the timestamps on your messages.",
    ],
    ps_fr: "P.S. Si une démo a fait des siennes, personne n'a rien remarqué. Enfin… presque personne. 😉",
    ps_en: "P.S. If a demo misbehaved, nobody noticed. Well… almost nobody. 😉",
    story_fr: "Et toi, que t'a apporté le DevFest Yaoundé au fil des années, de l'autre côté du micro ? Une rencontre, une opportunité, un déclic ? Laisse-nous un mot anonyme : tes histoires inspirent autant que tes talks.",
    story_en: "And what has DevFest Yaoundé given you over the years, from the other side of the mic? A connection, an opportunity, a spark? Leave us an anonymous note: your stories inspire as much as your talks.",
  },

  volunteer: {
    label: "Volunteer",
    line_fr: "pour son engagement sans faille, qui a fait tourner le {{event_name}}",
    line_en: "for the tireless commitment that kept {{event_name}} running",
    subject: "💛 Sans toi, rien n'aurait tourné · {{event_name}} ran on you",
    title_fr: "Le DevFest a tourné grâce à toi.",
    title_en: "DevFest ran on you.",
    message_fr: [
      "Salut {{first_name}} !",
      "Badges, files d'attente, chaises à déplacer, et « c'est où les toilettes ? » au moins 47 fois : tu as tout géré, avec le sourire (en façade, au moins). Pendant que tout le monde profitait de la journée, toi, tu faisais en sorte qu'elle se passe bien.",
      "Ton certificat est en pièce jointe, pour ton engagement sans faille. Il ne te rendra pas les kilomètres parcourus dans les couloirs, mais il dit l'essentiel : sans toi, rien de tout ça n'aurait tenu debout.",
    ],
    message_en: [
      "Hi {{first_name}}!",
      "Badges, queues, chairs to move, and \"where are the toilets?\" at least 47 times: you handled it all, with a smile (on the outside, at least). While everyone else enjoyed the day, you were the reason it went well.",
      "Your certificate is attached, for your tireless commitment. It won't give you back the miles you walked up and down those corridors, but it says what matters: without you, none of it would have held together.",
    ],
    ps_fr: "P.S. Tes jambes ont le droit de t'en vouloir un jour ou deux. Nous, on t'adore.",
    ps_en: "P.S. Your legs are allowed to hold a grudge for a day or two. We, on the other hand, adore you.",
    story_fr: "Maintenant que tes pieds se reposent : qu'est-ce que le DevFest Yaoundé a changé pour toi, cette année ou les précédentes ? Dis-le-nous en quelques mots, anonymement. C'est ton tour d'être écouté·e.",
    story_en: "Now that your feet are finally resting: what has DevFest Yaoundé changed for you, this year or any year before? Tell us in a few words, anonymously. It's your turn to be heard.",
  },

  organiser: {
    label: "Organiser",
    line_fr: "pour avoir imaginé, construit et porté le {{event_name}}",
    line_en: "for dreaming up, building and carrying {{event_name}}",
    subject: "🎉 On l'a fait, {{first_name}} · We did it",
    title_fr: "Des mois de travail. Une journée. Et quelle journée !",
    title_en: "Months of work. One day. What a day.",
    message_fr: [
      "Salut {{first_name}} !",
      "Les réunions « de 15 minutes » qui en duraient 90, les sponsors à relancer, les plans B, C et D, les messages WhatsApp à minuit… Tu as porté le {{event_name}} bien avant que la première personne passe la porte, et bien après que la dernière soit repartie.",
      "Ton certificat est en pièce jointe, pour avoir imaginé, construit et porté cette édition. Un bout de papier pour des mois d'engagement : on sait, le taux de change n'est pas terrible. Mais merci, sincèrement. Cette communauté existe parce que des gens comme toi choisissent de la construire.",
    ],
    message_en: [
      "Hi {{first_name}}!",
      "\"Quick 15-minute\" meetings that ran for 90, sponsors to chase, plans B, C and D, WhatsApp messages at midnight… You carried {{event_name}} long before the first person walked in, and long after the last one left.",
      "Your certificate is attached, for dreaming up, building and carrying this edition. One piece of paper for months of commitment: not a great exchange rate, we know. But thank you, truly. This community exists because people like you choose to build it.",
    ],
    ps_fr: "P.S. Repose-toi. Vraiment. La réunion de lancement de la prochaine édition peut attendre… au moins une semaine.",
    ps_en: "P.S. Rest. Really. The kick-off meeting for next year can wait… at least a week.",
    story_fr: "Toi qui l'as vu grandir de l'intérieur : qu'est-ce que le DevFest Yaoundé t'a apporté au fil des éditions ? Laisse un mot anonyme. Oui, même si tu connais sûrement la personne qui lira les réponses.",
    story_en: "You've watched it grow from the inside: what has DevFest Yaoundé given you over the editions? Leave an anonymous note. Yes, even though you probably know who'll read the answers.",
  },

  partner: {
    label: "Partner",
    line_fr: "pour son soutien, qui a rendu possible le {{event_name}}",
    line_en: "for the support that made {{event_name}} possible",
    subject: "🤝 Merci d'avoir cru en nous · Thank you for believing in us — {{event_name}}",
    title_fr: "Vous avez cru en nous. Merci.",
    title_en: "You believed in us. Thank you.",
    message_fr: [
      "Bonjour {{first_name}},",
      "Un DevFest, ce sont des talks, des rencontres, des idées… et des factures que quelqu'un doit bien régler. Vous avez choisi d'être à nos côtés, et grâce à vous, toute une communauté a vécu une journée qu'elle n'est pas près d'oublier.",
      "Votre certificat est en pièce jointe, en remerciement d'un soutien qui a rendu tout cela possible. Merci de croire en la communauté tech de Yaoundé : nous comptons bien vous rendre fiers, encore et encore.",
    ],
    message_en: [
      "Hello {{first_name}},",
      "A DevFest is talks, connections, ideas… and invoices someone has to pay. You chose to stand with us, and thanks to you a whole community had a day it won't forget any time soon.",
      "Your certificate is attached, in thanks for the support that made all of this possible. Thank you for believing in Yaoundé's tech community: we fully intend to make you proud, again and again.",
    ],
    ps_fr: "P.S. Oui, nous reviendrons vers vous pour la prochaine édition. Autant vous prévenir.",
    ps_en: "P.S. Yes, we'll be in touch about next year. Consider yourself warned.",
    story_fr: "Et pour vous, quel impact le DevFest Yaoundé a-t-il eu au fil des années ? Partagez-le en quelques mots, anonymement : votre regard compte beaucoup pour nous.",
    story_en: "And what impact has DevFest Yaoundé had for you over the years? Share it in a few words, anonymously: your perspective means a lot to us.",
  },
};

/** The Settings rows for one role's words, in the order they appear. */
function roleCopySettings_(role) {
  const c = ROLE_COPY_[role];
  const name = c.label;
  return [
    [`role_${role}`, c.label, `── ${name} ── what {{role}} prints on the certificate.`],
    [`line_fr_${role}`, c.line_fr, "{{role_line_fr}}: \"awarded …\" on the certificate and in the email."],
    [`line_en_${role}`, c.line_en, ""],
    [`subject_${role}`, c.subject, "The email's subject. Empty = email_subject."],
    [`title_fr_${role}`, c.title_fr, "The big headline at the top of the email."],
    [`title_en_${role}`, c.title_en, ""],
    [`message_fr_${role}`, c.message_fr.join("\n\n"), "The email's body. A blank line (Ctrl+Enter twice) starts a new paragraph."],
    [`message_en_${role}`, c.message_en.join("\n\n"), ""],
    [`ps_fr_${role}`, c.ps_fr, "The P.S. under the signature. Leave empty for none."],
    [`ps_en_${role}`, c.ps_en, ""],
    [`story_fr_${role}`, c.story_fr, "The invitation to leave an anonymous story at /storytime. Empty = no invitation."],
    [`story_en_${role}`, c.story_en, ""],
  ];
}
