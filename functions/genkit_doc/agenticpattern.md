# Implementing Agentic Patterns

Building powerful AI systems involves more than just calling a model; it requires structuring interactions in a way that balances reliability with flexibility. This is the core idea behind the **agentic scale**.

At one end of the scale, you have **Workflows**: structured, predictable sequences of tasks. They are highly reliable but less flexible. At the other end, you have **Agents**: autonomous systems that can reason, plan, and use tools to handle complex, unpredictable tasks. They are highly flexible but can be less reliable.

The key to building effective AI is to find the right point on this scale for your use case, often creating a hybrid that combines the best of both worlds. This guide explores key patterns along the agentic scale and shows you how to implement them using Genkit's core primitives like [flows](/docs/flows), [tools](/docs/tool-calling), and [interrupts](/docs/interrupts).

All of the code samples in this guide can be found in the [agentic-patterns sample](https://github.com/genkit-ai/samples/tree/main/agentic-patterns) on GitHub.

## Patterns on the Agentic Scale

We will cover the following patterns, moving from more structured workflows to more autonomous agents:

- **Sequential Processing**: The simplest workflow, decomposing a task into a fixed sequence of LLM calls.
- **Conditional Routing**: Adding branching logic to a workflow based on an LLM's output.
- **Parallel Execution**: Running multiple LLM calls concurrently for speed or to gather diverse perspectives.
- **Tool Calling**: Introducing flexibility by allowing an LLM to call external functions to retrieve information or perform actions.
- **Iterative Refinement**: Creating a feedback loop where an LLM critiques and improves its own work.
- **Autonomous Operation**: Building agents that can independently plan and execute tasks to achieve a goal.
- **Stateful Interactions**: Turning any workflow into a stateful, conversational experience by managing history.

---

## Workflow: Sequential Processing

This is the simplest workflow pattern, where a task is broken down into a fixed sequence of steps. Each step processes the output of the previous one. Genkit [flows](/docs/flows) are the ideal tool for orchestrating these sequences.

A key advantage of this pattern is the ability to use different [models](/docs/models) for different steps. For example, you could use a fast, cheaper model to generate an initial idea, and then a more powerful model to elaborate on it. You can also create multi-modal scenarios, like using one model to generate a text prompt for an image generation model.

<Tabs>
<TabItem label="Simple Chaining">
In this example, the flow first generates a story idea and then uses that idea to write the beginning of the story.

```typescript
import { z } from 'genkit';
import { ai } from './genkit.js';

export const storyWriterFlow = ai.defineFlow(
  {
    name: 'storyWriterFlow',
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.string(),
  },
  async ({ topic }) => {
    // Step 1: Generate a creative story idea
    const ideaResponse = await ai.generate({
      prompt: `Generate a unique story idea about a ${topic}.`,
      output: {
        schema: z.object({
          idea: z.string().describe('A short, compelling story concept'),
        }),
      },
    });

    const storyIdea = ideaResponse.output?.idea;
    if (!storyIdea) {
      throw new Error('Failed to generate a story idea.');
    }

    // Step 2: Use the idea to write the beginning of the story
    const storyResponse = await ai.generate({
      prompt: `Write the opening paragraph for a story based on this idea: ${storyIdea}`,
    });

    return storyResponse.text;
  }
);
```

</TabItem>
<TabItem label="Multi-Modal Chaining">
This flow uses a text model to generate a detailed prompt for an image generation model, creating a piece of art based on a simple concept.

```typescript
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { ai } from './genkit.js';

export const imageGeneratorFlow = ai.defineFlow(
  {
    name: 'imageGeneratorFlow',
    inputSchema: z.object({ concept: z.string() }),
    outputSchema: z.string(),
  },
  async ({ concept }) => {
    // Step 1: Use a text model to generate a rich image prompt
    const promptResponse = await ai.generate({
      model: googleAI.model('gemini-2.5-flash'),
      prompt: `Create a detailed, artistic prompt for an image generation model. The concept is: "${concept}".`,
    });

    const imagePrompt = promptResponse.text;

    // Step 2: Use the generated prompt to create an image
    const imageResponse = await ai.generate({
      model: googleAI.model('imagen-3.0-generate-002'),
      prompt: imagePrompt,
      output: { format: 'media' },
    });

    const imageUrl = imageResponse.media?.url;
    if (!imageUrl) {
      throw new Error('Failed to generate an image.');
    }
    return imageUrl;
  }
);
```

</TabItem>
</Tabs>

---

## Workflow: Conditional Routing

This pattern adds branching logic to a workflow. An initial LLM call classifies the input, and the flow then routes the task to a specialized downstream path.

This is a great place to optimize for cost and latency. The initial classification step can often be handled by a smaller, faster model (like  `gemini-2.5-flash` or even `gemini-2.5-flash-lite`), while the more complex downstream tasks can be routed to more powerful models.

This flow determines if a user's request is a simple question or a request for creative writing and handles it accordingly.

```typescript
import { z } from 'genkit';
import { ai } from './genkit.js';

export const routerFlow = ai.defineFlow(
  {
    name: 'routerFlow',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.string(),
  },
  async ({ query }) => {
    // Step 1: Classify the user's intent
    const intentResponse = await ai.generate({
      prompt: `Classify the user's query as either a 'question' or a 'creative' request. Query: "${query}"`,
      output: {
        schema: z.object({
          intent: z.enum(['question', 'creative']),
        }),
      },
    });

    const intent = intentResponse.output?.intent;

    // Step 2: Route based on the intent
    if (intent === 'question') {
      // Handle as a straightforward question
      const answerResponse = await ai.generate({
        prompt: `Answer the following question: ${query}`,
      });
      return answerResponse.text;
    } else if (intent === 'creative') {
      // Handle as a creative writing prompt
      const creativeResponse = await ai.generate({
        prompt: `Write a short poem about: ${query}`,
      });
      return creativeResponse.text;
    } else {
      return "Sorry, I couldn't determine how to handle your request.";
    }
  }
);
```

---

## Workflow: Parallel Execution

This pattern executes multiple LLM calls simultaneously, either to perform independent sub-tasks faster (Sectioning) or to generate multiple diverse outputs for comparison (Voting). `Promise.all()` within a Genkit flow is perfect for this.

This example uses sectioning to generate a product name and a marketing tagline at the same time.

```typescript
import { z } from 'genkit';
import { ai } from './genkit.js';

export const marketingCopyFlow = ai.defineFlow(
  {
    name: 'marketingCopyFlow',
    inputSchema: z.object({ product: z.string() }),
    outputSchema: z.object({
      name: z.string(),
      tagline: z.string(),
    }),
  },
  async ({ product }) => {
    const [nameResponse, taglineResponse] = await Promise.all([
      // Task 1: Generate a creative name
      ai.generate({
        prompt: `Generate a creative name for a new product: ${product}.`,
      }),
      // Task 2: Generate a catchy tagline
      ai.generate({
        prompt: `Generate a catchy tagline for a new product: ${product}.`,
      }),
    ]);

    return {
      name: nameResponse.text,
      tagline: taglineResponse.text,
    };
  }
);
```

---

## Hybrid: Tool Calling

This is where workflows start becoming more agentic. Instead of following a fixed path, the LLM can dynamically decide to call external functions ([tools](/docs/tool-calling)) to retrieve information or perform actions. This allows the workflow to interact with the outside world.

<Tabs>
<TabItem label="Simple Tool">
This flow provides an LLM with a `getWeather` tool. The LLM can then decide whether to call this tool based on the user's prompt.

```typescript
import { z } from 'genkit';
import { ai } from './genkit.js';

// Define a tool that can be called by the LLM
const getWeather = ai.defineTool(
  {
    name: 'getWeather',
    description: 'Get the current weather in a given location.',
    inputSchema: z.object({ location: z.string() }),
    outputSchema: z.string(),
  },
  async ({ location }) => {
    // In a real app, you would call a weather API here.
    return `The weather in ${location} is 75°F and sunny.`;
  }
);

export const toolCallingFlow = ai.defineFlow(
  {
    name: 'toolCallingFlow',
    inputSchema: z.object({ prompt: z.string() }),
    outputSchema: z.string(),
  },
  async ({ prompt }) => {
    const response = await ai.generate({
      prompt: prompt,
      tools: [getWeather],
    });

    return response.text;
  }
);
```

</TabItem>
<TabItem label="Agentic RAG">
A more advanced form of tool use is Agentic RAG (Retrieval-Augmented Generation). Here, the agent uses a retrieval tool to fetch relevant documents from a vector store and uses them to answer a question.

```typescript
import { DocumentDataSchema, z } from 'genkit';
import { ai } from './genkit.js';
import { devLocalIndexerRef, devLocalRetrieverRef } from '@genkit-ai/dev-local-vectorstore';
import { Document } from 'genkit/retriever';

// Define the indexer and retriever references
export const menuIndexer = devLocalIndexerRef('menuQA');
export const menuRetriever = devLocalRetrieverRef('menuQA');

// 1. Define a retrieval tool
const menuRagTool = ai.defineTool(
  {
    name: 'menuRagTool',
    description: 'Use to retrieve information from the Genkit Grub Pub menu.',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.array(DocumentDataSchema),
  },
  async ({ query }) => {
    const docs = await ai.retrieve({
      retriever: menuRetriever,
      query,
      options: { k: 3 },
    });
    return docs;
  }
);

// 2. Use the tool in a flow
export const agenticRagFlow = ai.defineFlow(
  {
    name: 'agenticRagFlow',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.string(),
  },
  async ({ question }) => {
    const llmResponse = await ai.generate({
      prompt: question,
      tools: [menuRagTool],
      system: `You are a helpful AI assistant that can answer questions about the food available on the menu at Genkit Grub Pub.
Use the provided tool to answer questions.
If you don't know, do not make up an answer.
Do not add or change items on the menu.`,
    });
    return llmResponse.text;
  }
);
```

</TabItem>
</Tabs>

---

## Hybrid: Iterative Refinement

This pattern creates a feedback loop to improve output quality. An "optimizer" LLM generates content, and an "evaluator" LLM provides critiques. The process repeats until the output meets a desired standard, moving further toward agent-like behavior.

This flow writes a short blog post, then repeatedly evaluates and refines it until the evaluator is satisfied.

```typescript
import { z } from 'genkit';
import { ai } from './genkit.js';

export const iterativeRefinementFlow = ai.defineFlow(
  {
    name: 'iterativeRefinementFlow',
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.string(),
  },
  async ({ topic }) => {
    let content = '';
    let feedback = '';
    let attempts = 0;

    // Step 1: Generate the initial draft
    content = (
      await ai.generate({
        prompt: `Write a short, single-paragraph blog post about: ${topic}.`,
      })
    ).text;

    // Step 2: Iteratively refine the content
    while (attempts < 3) {
      attempts++;

      // The "Evaluator" provides feedback
      const evaluationResponse = await ai.generate({
        prompt: `Critique the following blog post. Is it clear, concise, and engaging? Provide specific feedback for improvement. Post: "${content}"`,
        output: {
          schema: z.object({
            critique: z.string(),
            satisfied: z.boolean(),
          }),
        },
      });

      const evaluation = evaluationResponse.output;
      if (!evaluation) {
        throw new Error('Failed to evaluate content.');
      }

      if (evaluation.satisfied) {
        break; // Exit loop if content is good enough
      }

      feedback = evaluation.critique;

      // The "Optimizer" refines the content based on feedback
      content = (
        await ai.generate({
          prompt: `Revise the following blog post based on the feedback provided.
          Post: "${content}"
          Feedback: "${feedback}"`,
        })
      ).text;
    }

    return content;
  }
);
```

---

## Agent: Autonomous Operation

At the far end of the scale, an autonomous agent can independently plan and execute a series of steps to achieve a goal, using a set of tools. Genkit's [tool-calling](/docs/tool-calling) mechanism, combined with [interrupts](/docs/interrupts) for human-in-the-loop scenarios, provides a robust foundation for building these systems.

This example shows a simple research agent that can search the web and ask for clarification. It will continue to execute until it believes the task is complete or it reaches its turn limit.

```typescript
import { z } from 'genkit';
import { ai } from './genkit.js';
import { googleAI } from '@genkit-ai/google-genai';

// A tool for the agent to search the web
const searchWeb = ai.defineTool(
  {
    name: 'searchWeb',
    description: 'Search the web for information on a given topic.',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.string(),
  },
  async ({ query }) => {
    // In a real app, you would implement a web search API call here.
    return `You found search results for: ${query}`;
  }
);

// A tool for the agent to ask the user a question
const askUser = ai.defineInterrupt(
  {
    name: 'askUser',
    description: 'Ask the user a clarifying question.',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.string(),
  },
);

export const researchAgent = ai.defineFlow(
  {
    name: 'researchAgent',
    inputSchema: z.object({ task: z.string() }),
    outputSchema: z.string(),
  },
  async ({ task }) => {
    let response = await ai.generate({
      system: `You are a helpful research assistant. Your goal is to provide a comprehensive answer to the user's task.`,
      prompt: `Your task is: ${task}. Use the available tools to accomplish this.`,
      model: googleAI.model('gemini-2.5-pro'),
      tools: [searchWeb, askUser],
      maxTurns: 5, // Limit the number of back-and-forth turns
    });

    // Handle potential interrupts (e.g., asking the user a question)
    while (response.interrupts.length > 0) {
      const interrupt = response.interrupts[0];
      if (interrupt.toolRequest.name === 'askUser') {
        const question = (interrupt.toolRequest.input as any).question;
        
        // In a real app, you would present the question to the user and get their answer.
        const userAnswer = await Promise.resolve(`The user answered: "Sample answer for '${question}'"`);

        response = await ai.generate({
          messages: response.messages,
          tools: [searchWeb, askUser],
          resume: {
            respond: [askUser.respond(interrupt, userAnswer)],
          },
        });
      } else {
        // Handle other unexpected interrupts if necessary
        break;
      }
    }

    return response.text;
  }
);
```

---

## Bonus: Stateful Interactions

Any of the patterns above can be turned into a stateful, conversational interaction by managing conversation history. This allows the agent or workflow to remember previous turns in the conversation and maintain context.

The key is to:
1.  Load the history for the current session.
2.  Append the new user message to the history.
3.  Call `ai.generate()` with the full message history. This is where you can plug in any of the other patterns (like tool calling or routing) to make your conversational agent more powerful.
4.  Save the updated history (including the model's response) for the next turn.

This example shows a simple chat flow that maintains state.

```typescript
import { z } from 'genkit';
import { MessageData } from 'genkit/beta';
import { ai } from './genkit.js';

// A simple in-memory store for conversation history.
// In a real app, you would use a database like Firestore or Redis.
const historyStore: Record<string, MessageData[]> = {};

async function loadHistory(sessionId: string): Promise<MessageData[]> {
  return historyStore[sessionId] || [];
}

async function saveHistory(sessionId: string, history: MessageData[]) {
  historyStore[sessionId] = history;
}

export const statefulChatFlow = ai.defineFlow(
  {
    name: 'statefulChatFlow',
    inputSchema: z.object({
      sessionId: z.string(),
      message: z.string(),
    }),
    outputSchema: z.string(),
  },
  async ({ sessionId, message }) => {
    // 1. Load history
    const history = await loadHistory(sessionId);

    // 2. Append new message
    history.push({ role: 'user', content: [{ text: message }] });

    // 3. Generate response with history
    const response = await ai.generate({
      messages: history,
    });

    // 4. Save updated history
    await saveHistory(sessionId, response.messages);

    return response.text;
  }
);
```