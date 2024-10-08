import axios from 'axios';
import marked from 'marked';
import { handleError, ROOT_ID, genId } from '../utils';
import { NewDoc } from '../storage';

type GenRequest = {
  from: string;
  to: string;
  title: string;
  content: string;
};

type GenResponse = {
  id?: string;
  message?: string;
};

type NodeId = string; // 8 bit - 36 radix
type PropsKey = string;
type Timestamp = number;
type Timestamped<T> = { t: Timestamp, v: T };
type MindMapCp = Record<NodeId, Partial<{
  stringProps: Record<PropsKey, Timestamped<string>>;
  // `content` is the text of the node
  numberProps: Record<PropsKey, Timestamped<number>>;
  booleanProps: Record<PropsKey, Timestamped<boolean>>;
  children: Timestamped<NodeId>[];
}>>;

/**
 * Generates a new document based on the provided input.
 *
 * @param body - The input data as a Buffer, expected to be a JSON string
 * containing the generation request.
 * @returns A promise that resolves to a GenResponse object.
 *
 * The function performs the following steps:
 * 1. Parses the input buffer to a GenRequest object.
 * 2. Validates the input fields (`from`, `to`, `title`, `content`).
 * 3. Sends a POST request to an external API to generate a mind map.
 * 4. Converts the API response to a mind map format.
 * 5. Creates a new document with the generated mind map content.
 *
 * @throws Will return an error message if any of the input fields are
 * invalid or if the API request fails.
 */
export async function Gen(body: Buffer): Promise<GenResponse> {
  try {
    const req: GenRequest = JSON.parse(Buffer.from(body).toString('utf-8'));
    if (req.from === '') {
      return { message: 'must specify a input doc type' };
    }
    if (req.from !== 'docx' && req.from !== 'pptx') {
      return { message: 'invalid input doc type' };
    }
    if (req.to === '') {
      return { message: 'must specify a input doc type' };
    }
    if (req.to !== 'markdown') {
      return { message: 'invalid output doc type' };
    }
    if (req.title === '') {
      return { message: 'must specify a input doc title' };
    }
    if (req.content === '') {
      return { message: 'must specify a input doc content' };
    }
    let data = JSON.stringify({
      "Url": req.title,
      "PageContent": req.content
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'http://edgecontextualchat.edgebrowser.microsoft-testing-falcon.io/api/mindmap/generation?features=udsmindtoken5',
      headers: {
        'Content-Type': 'application/json',
      },
      data: data
    };
    const result = await axios.request(config);
    const tokens = marked.lexer(result.data.result);
    const cp = tokensToMindMapCp(tokens);
    cp[ROOT_ID].stringProps!.content.v = req.title;
    return await NewDoc(Buffer.from(JSON.stringify(cp)));
  } catch (err: unknown) {
    return { message: handleError(err) };
  }
}

/**
 * Converts a list of marked tokens into a MindMapCp structure.
 *
 * @param tokens - The list of marked tokens to convert.
 * @returns A MindMapCp object representing the hierarchical structure of the
 * tokens.
 *
 * The function processes tokens of type 'heading' and 'list'. For 'heading'
 * tokens, it creates a new node with the heading text and adds it to the mind
 * map at the appropriate level. For 'list' tokens, it creates nodes for each
 * list item and adds them as children to the current node in the stack.
 *
 * The root node is initialized with a timestamp and the string 'Root'. Each
 * node is assigned a unique ID generated by the `genId` function and is
 * timestamped with the current time.
 */
export function tokensToMindMapCp(tokens: marked.TokensList): MindMapCp {
  const ts = Date.now();
  const mindMap: MindMapCp = {
    [ROOT_ID]: {
      children: [],
      stringProps: { content: { t: ts, v: 'Root' } }
    }
  };
  const stack: { nodeId: NodeId, level: number }[] = [{ nodeId: ROOT_ID, level: 0 }];

  for (const token of tokens) {
    if (token.type === 'heading') {
      const nodeId = genId();
      const node = {
        stringProps: { content: { t: ts, v: token.text } },
        children: []
      };

      while (stack.length > 0 && stack[stack.length - 1].level >= token.depth) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];
      mindMap[parent.nodeId].children!.push({ t: ts, v: nodeId });
      mindMap[nodeId] = node;
      stack.push({ nodeId, level: token.depth });
    }
    if (token.type === 'list') {
      for (const item of token.items) {
        const nodeId = genId();
        const node = {
          stringProps: { content: { t: ts, v: item.text } },
          children: []
        };

        const parent = stack[stack.length - 1];
        mindMap[parent.nodeId].children!.push({ t: ts, v: nodeId });
        mindMap[nodeId] = node;
      }
    }
  }

  return mindMap;
}
