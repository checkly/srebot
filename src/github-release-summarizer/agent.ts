// // Your imports go here
// import {
//     OpenAI,
//     Ollama,
//     FunctionTool,
//     ReActAgent,
//     Settings,
//     BaseToolWithCall,
//     Groq,
//   } from 'llamaindex';
//   import 'dotenv/config';
//   import axios from 'axios';
//   import { Octokit } from '@octokit/rest';
//   const groqapikey = process.env.GROQ_API_KEY;
//   const lokiApiKey = process.env.LOKI_API_KEY!;
//   const user = process.env.LOKI_USER!;
//   const lokiUrl = process.env.LOKI_URL!;
//   export class LokiAgent {
//     private readonly LokiClient: LokiClient = new LokiClient(
//       lokiUrl,
//       lokiApiKey,
//       user,
//     );
//     agent: ReActAgent;
//     init() {
//       /*Settings.llm = new Ollama({
//         model: 'llama3.1:8b-instruct-fp16',
//         //model: 'llama3.1',
//       });*/
//       /*const o = new OpenAI({
//         //model: 'gpt-3.5-turbo',
//         model: 'gpt-4o',
//         //additionalChatOptions: { response_format: { type: 'json_object' } },
//         apiKey: process.env.OPENAI_API_KEY,
//       });
//       o.lazySession();
//       Settings.llm = o;*/
  
//       Settings.llm = new Groq({
//         apiKey: groqapikey,
//         model: 'llama3-70b-8192',
//       });
  
//       Settings.callbackManager.on('llm-tool-call', (event) => {
//         console.log(event.detail);
//       });
//       Settings.callbackManager.on('llm-tool-result', (event) => {
//         console.log(event.detail);
//       });
//       const tools = this.setupTools();
//       this.agent = new ReActAgent({ tools: tools, verbose: true });
//     }
  
//     setupTools(): BaseToolWithCall[] {
//       const getServices = FunctionTool.from(
//         this.LokiClient.getAvailableServices,
//         {
//           name: 'getServices',
//           description:
//             'use this function to get a list of available services you can query logs for',
//           parameters: {
//             type: [],
//             properties: {},
//             required: [],
//           },
//         },
//       );
//       const getErrors = FunctionTool.from(
//         async ({
//           serviceName,
//           minutes,
//         }: {
//           serviceName: string;
//           minutes: number;
//         }): Promise<string> => {
//           if (!serviceName || !minutes) {
//             return 'you need to provide a service name and minutes to query back';
//           }
//           const c = await this.LokiClient.getErrorsForService(
//             serviceName,
//             minutes,
//           );
//           if (c.data.result.length === 0) {
//             return 'No errors found';
//           }
//           return c.data.result[0].values;
//         },
//         {
//           name: 'getErrors',
//           description:
//             'use this function to get all errors for a service within a specified time range',
//           parameters: {
//             type: 'object',
//             properties: {
//               serviceName: {
//                 type: 'string',
//                 description: 'the name of the service you want to query',
//               },
//               minutes: {
//                 type: 'number',
//                 description: 'the amount of minutes you want to query back',
//               },
//             },
//             required: ['serviceName', 'minutes'],
//           },
//         },
//       );
//       return [getErrors, getServices];
//     }
  
//     async queryAgent(question: string) {
//       console.log(`querying agent `);
//       const response = await this.agent.chat({
//         message: `
//      call each tool only once. In your final response be  detailed.
//      Answer in this format:
//       Findings: your findings and a summary of the logs
//       Explanation of Errors: explain errors you found
//       Suggested Fix: what you suggest to fix the errors
//      Here is the task: 
//           ${question}
  
//            `,
//       });
//       console.log(response);
//       const content = response.message.content;
//       if (typeof content === 'string') {
//         // Extract Thought
  
//         return { thought: content, answer: content };
//       } else {
//         return { thought: 'none', answer: content };
//       }
//     }
//   }
