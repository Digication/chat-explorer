import { AppDataSource } from "../data-source.js";
import { ToriTag } from "../entities/ToriTag.js";

interface ToriSeedEntry {
  name: string;
  domain: string;
  domainNumber: number;
  categoryNumber: string;
  description: string;
  parentCategory: string | null;
}

const TORI_CATEGORIES: ToriSeedEntry[] = [
  // DOMAIN 1: COGNITIVE & ANALYTICAL REFLECTION
  { name: "Perspective Shifting", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.1", description: "Critically examining one's own viewpoint and actively considering alternative ways of seeing a situation or problem.", parentCategory: null },
  { name: "Pattern Recognition", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.2", description: "Examining the ways in which one identifies and interprets recurring structures, trends, or regularities in data, experiences, or phenomena.", parentCategory: null },
  { name: "Integrative Thinking", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.3", description: "Examining how one combines diverse or even conflicting perspectives, ideas, or data into a cohesive understanding or solution.", parentCategory: null },
  { name: "Cognitive Flexibility", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.4", description: "Examining one's ability to adapt thoughts and strategies when faced with changing circumstances, new information, or unexpected obstacles.", parentCategory: null },
  { name: "Critical Thinking", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.5", description: "Examining how one evaluates information, forms judgments, and draws conclusions through logical reasoning and evidence-based analysis.", parentCategory: null },
  { name: "Problem-Solving", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.6", description: "Examining the methods, strategies, and thought processes used to address challenges and arrive at solutions.", parentCategory: null },
  { name: "Intuitive Insight", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.7", description: "Examining spontaneous 'aha' moments or sudden realizations that arise outside of deliberate, analytical thought.", parentCategory: null },
  { name: "Cognitive Biases", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.8", description: "Critically examining one's habitual thinking shortcuts and systematic errors in judgment or decision-making.", parentCategory: null },
  { name: "Memory", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.9", description: "Examining the ways in which one encodes, stores, and retrieves information, and evaluating the reliability and accuracy of recalled experiences.", parentCategory: null },
  { name: "Decision-Making", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.10", description: "Examining the cognitive processes, strategies, and influences behind one's choices, from initial information gathering to final selection.", parentCategory: null },
  { name: "Risk Assessment", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.11", description: "Critically examining how one identifies, evaluates, and responds to potential hazards or uncertainties.", parentCategory: null },
  { name: "Creative Problem-Solving", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.12", description: "Examining the processes and techniques used to generate novel ideas, approaches, or solutions to complex challenges.", parentCategory: null },
  { name: "Mental Models", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.13", description: "Examining the internal representations and assumptions one holds about how the world works, including processes, systems, and relationships.", parentCategory: null },
  { name: "Unconscious Bias", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.14", description: "Examining the hidden or implicit attitudes that shape one's perceptions and behaviors without conscious awareness.", parentCategory: null },
  { name: "Curiosity & Inquiry", domain: "Cognitive & Analytical Reflection", domainNumber: 1, categoryNumber: "1.15", description: "Examining how one's sense of wonder and drive to explore shapes the process of learning and discovery.", parentCategory: null },

  // DOMAIN 2: EMOTIONAL & AFFECTIVE REFLECTION
  { name: "Emotional Differentiation", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.1", description: "Recognizing, labeling, and distinguishing between discrete emotions with precision (emotional granularity).", parentCategory: null },
  { name: "Resilience & Failure Adaptation", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.2", description: "Recovering or bouncing back from setbacks or adversity, and learning from mistakes to transform them into growth opportunities.", parentCategory: null },
  { name: "Emotional Resilience & Healing", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.2.1", description: "Focusing on the emotional recovery process after setbacks, including coping strategies and emotional healing.", parentCategory: "Resilience & Failure Adaptation" },
  { name: "Trauma-Informed Reflection", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.2.2", description: "Examining experiences through a trauma-aware lens, recognizing how past trauma influences present reactions and growth.", parentCategory: "Resilience & Failure Adaptation" },
  { name: "Growing from Failure", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.2.3", description: "Examining how specific failures or mistakes have led to learning, adaptation, and eventual improvement.", parentCategory: "Resilience & Failure Adaptation" },
  { name: "Mindful Awareness & Action", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.3", description: "Paying full, nonjudgmental attention to the present moment and responding with clarity and intentionality.", parentCategory: null },
  { name: "Observational Mindfulness", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.3.1", description: "Practicing nonjudgmental observation of one's thoughts, feelings, and surroundings in the present moment.", parentCategory: "Mindful Awareness & Action" },
  { name: "Everyday/Applied Mindfulness", domain: "Emotional & Affective Reflection", domainNumber: 2, categoryNumber: "2.3.2", description: "Applying mindful awareness to daily activities and routine tasks to enhance presence and intentionality.", parentCategory: "Mindful Awareness & Action" },

  // DOMAIN 3: SOCIAL & INTERPERSONAL REFLECTION
  { name: "Learning from Others", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.1", description: "Examining how interactions with peers, mentors, or role models contribute to one's own knowledge and growth through social observation or collaboration.", parentCategory: null },
  { name: "Social Dynamics & Collaboration", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.2", description: "Reflecting on group interactions, team processes, and one's role in collaborative settings.", parentCategory: null },
  { name: "Group Retrospectives", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.2.1", description: "Structured reflection on what worked and what didn't in group or team settings.", parentCategory: "Social Dynamics & Collaboration" },
  { name: "Peer Mentoring Reflection", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.2.2", description: "Examining the experience of mentoring or being mentored by peers.", parentCategory: "Social Dynamics & Collaboration" },
  { name: "Facilitation Skills", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.2.3", description: "Reflecting on one's ability to guide group processes and discussions effectively.", parentCategory: "Social Dynamics & Collaboration" },
  { name: "Feedback Processing", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.3", description: "Thoughtfully examining how one receives, interprets, and responds to feedback from others, transforming external feedback into actionable insights.", parentCategory: null },
  { name: "Social Influences", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.4", description: "Reflecting on how societal norms, cultural values, peer pressure, or authority figures have shaped one's beliefs and behaviors.", parentCategory: null },
  { name: "Conflict Management & Resolution", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.5", description: "Reflecting on interpersonal conflicts, analyzing causes, conflict styles, emotional responses, and resolution processes.", parentCategory: null },
  { name: "Preventing Escalation", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.5.1", description: "Examining strategies for de-escalating tense situations before they become full conflicts.", parentCategory: "Conflict Management & Resolution" },
  { name: "Conflict Resolution Tactics", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.5.2", description: "Reflecting on specific approaches used to resolve disagreements or disputes.", parentCategory: "Conflict Management & Resolution" },
  { name: "Post-Conflict Reflection", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.5.3", description: "Examining the aftermath of conflicts and lessons learned from their resolution.", parentCategory: "Conflict Management & Resolution" },
  { name: "Relationship Adaptability", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.6", description: "Reflecting on how one adapts to changes and differences in personal or professional relationships.", parentCategory: null },
  { name: "Reflective Listening", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.7", description: "Examining how well one listens in conversations, summarizes or paraphrases points accurately, and responds to emotions conveyed.", parentCategory: null },
  { name: "Empowerment", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.8", description: "Examining one's sense of personal agency and power, as well as efforts to empower oneself or others.", parentCategory: null },
  { name: "Interpersonal Skills", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.9", description: "Self-assessing strengths and weaknesses in communication, empathy, teamwork, leadership, and relationship-building abilities.", parentCategory: null },
  { name: "Social/Activist Engagement", domain: "Social & Interpersonal Reflection", domainNumber: 3, categoryNumber: "3.10", description: "Reflecting on one's engagement in social or political causes, community service, or activism and how it shapes values and skills.", parentCategory: null },

  // DOMAIN 4: PERSONAL GROWTH & SELF-DEVELOPMENT REFLECTION
  { name: "Future Planning", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.1", description: "Envisioning one's long-term direction and strategizing goals, resources, and actions to align current decisions with desired future outcomes.", parentCategory: null },
  { name: "Self-Regulation & Boundaries", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.2", description: "Evaluating one's capacity to control behaviors, emotions, and thoughts, and establishing personal limits to protect well-being.", parentCategory: null },
  { name: "Narrative Construction", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.3", description: "Examining how individuals shape, interpret, and retell personal or collective experiences as cohesive stories that inform identity and purpose.", parentCategory: null },
  { name: "Mindset Development", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.4", description: "Examining and shifting core beliefs about the malleability of abilities, intelligence, or personal qualities (fixed vs. growth mindset).", parentCategory: null },
  { name: "Behavioral Patterns", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.5", description: "Examining recurring actions, habits, or routines—often triggered automatically—and evaluating whether they align with personal values and goals.", parentCategory: null },
  { name: "Goals & Motivation", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.6", description: "Exploring how individuals set objectives, sustain drive, and evaluate whether their goals align with personal values (intrinsic vs. extrinsic).", parentCategory: null },
  { name: "Creativity & Flow", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.7", description: "Examining how one enters a state of deep immersion (flow) and understanding factors that catalyze or inhibit creative thinking.", parentCategory: null },
  { name: "Habit Formation", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.8", description: "Examining how repetitive behaviors become automated via cue-routine-reward loops, and how to consciously replace or instill habits.", parentCategory: null },
  { name: "Time Management", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.9", description: "Examining how individuals plan, prioritize, and allocate their time to align daily activities with key goals.", parentCategory: null },
  { name: "Adaptive Learning", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.10", description: "Highlighting one's capacity to adjust learning strategies in response to changing environments or feedback, including meta-learning.", parentCategory: null },
  { name: "Self-Efficacy", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.11", description: "Concentrating on one's confidence in performing specific tasks or handling challenges, informed by past successes, role models, and emotional states.", parentCategory: null },
  { name: "Personal Growth", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.12", description: "Broad introspective focus on one's evolving self—emotionally, morally, and intellectually—and how experiences contribute to self-improvement.", parentCategory: null },
  { name: "Reflection (Meta-Reflection)", domain: "Personal Growth & Self-Development Reflection", domainNumber: 4, categoryNumber: "4.13", description: "Evaluating how one engages in reflective practice itself—scrutinizing its depth, accuracy, biases, and effectiveness.", parentCategory: null },

  // DOMAIN 5: CULTURAL / ETHICAL / CONTEXTUAL REFLECTION
  { name: "Culture & Cross-Cultural Understanding", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.1", description: "Examining how cultural values, beliefs, and norms shape one's worldview and interactions, and developing intercultural competence.", parentCategory: null },
  { name: "Cultural Self-Awareness", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.1.1", description: "Examining one's own cultural identity, values, and assumptions and how they influence perceptions.", parentCategory: "Culture & Cross-Cultural Understanding" },
  { name: "Cross-Cultural Communication", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.1.2", description: "Reflecting on challenges and strategies in communicating across cultural boundaries.", parentCategory: "Culture & Cross-Cultural Understanding" },
  { name: "Navigating Cultural Biases", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.1.3", description: "Examining and addressing biases rooted in cultural conditioning.", parentCategory: "Culture & Cross-Cultural Understanding" },
  { name: "Ethics", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.2", description: "Examining moral principles and reasoning behind right and wrong actions, evaluating how personal values and societal norms guide behavior.", parentCategory: null },
  { name: "Everyday Ethical Dilemmas", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.2.1", description: "Examining common moral choices encountered in daily life and their implications.", parentCategory: "Ethics" },
  { name: "Professional/Organizational Ethics", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.2.2", description: "Reflecting on ethical challenges within professional or organizational contexts.", parentCategory: "Ethics" },
  { name: "Moral Development & Self-Awareness", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.2.3", description: "Examining one's evolving moral compass and understanding of right and wrong.", parentCategory: "Ethics" },
  { name: "Purpose, Spirituality & Meaning", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.3", description: "Exploring one's overarching life direction, existential questions, and personal or transcendent beliefs.", parentCategory: null },
  { name: "Philosophical/Existential Inquiry", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.3.1", description: "Examining fundamental questions about existence, purpose, and the nature of reality.", parentCategory: "Purpose, Spirituality & Meaning" },
  { name: "Faith-Based Reflection", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.3.2", description: "Reflecting on spiritual or religious beliefs and their role in shaping one's worldview and actions.", parentCategory: "Purpose, Spirituality & Meaning" },
  { name: "Values and Meaning-Making", domain: "Cultural, Ethical & Contextual Reflection", domainNumber: 5, categoryNumber: "5.3.3", description: "Examining how personal values are formed and how they contribute to one's sense of meaning and purpose.", parentCategory: "Purpose, Spirituality & Meaning" },

  // DOMAIN 6: LIFE TRANSITIONS & BROADER DEVELOPMENT REFLECTION
  { name: "Temporal Awareness", domain: "Life Transitions & Broader Development Reflection", domainNumber: 6, categoryNumber: "6.1", description: "Conscious recognition of how one's perception of time (past, present, and future) influences thoughts, priorities, and personal development.", parentCategory: null },
  { name: "Life Phases", domain: "Life Transitions & Broader Development Reflection", domainNumber: 6, categoryNumber: "6.2", description: "Awareness and examination of distinct stages of life, each with specific developmental tasks, challenges, and contributions to personal identity.", parentCategory: null },
  { name: "Adaptability", domain: "Life Transitions & Broader Development Reflection", domainNumber: 6, categoryNumber: "6.3", description: "Examining one's capacity to modify thoughts, emotions, and behaviors in response to new or changing circumstances.", parentCategory: null },
  { name: "Life Transitions", domain: "Life Transitions & Broader Development Reflection", domainNumber: 6, categoryNumber: "6.4", description: "Introspective focus on how one copes with and finds meaning in significant shifts in life roles or circumstances.", parentCategory: null },
  { name: "Crisis Management", domain: "Life Transitions & Broader Development Reflection", domainNumber: 6, categoryNumber: "6.5", description: "Examining how one responds psychologically and behaviorally to acute crises or traumatic events, focusing on coping and potential growth.", parentCategory: null },
];

export async function seedToriTags(): Promise<void> {
  const repo = AppDataSource.getRepository(ToriTag);
  const existingCount = await repo.count();

  if (existingCount >= TORI_CATEGORIES.length) {
    console.log(`TORI tags already seeded (${existingCount} found). Skipping.`);
    return;
  }

  console.log(`Seeding ${TORI_CATEGORIES.length} TORI tags...`);

  for (const entry of TORI_CATEGORIES) {
    const existing = await repo.findOne({ where: { name: entry.name } });
    if (!existing) {
      await repo.save(repo.create(entry));
    }
  }

  const finalCount = await repo.count();
  console.log(`TORI tag seeding complete. Total: ${finalCount}`);
}
