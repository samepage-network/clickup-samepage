import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";
import getAccessToken from "samepage/backend/getAccessToken";
import {
  BackendRequest,
  zSamePageSchema,
  zSamePageState,
} from "samepage/internal/types";
import { z } from "zod";
import debug from "samepage/utils/debugger";
import decodeState from "src/util/decodeState";
import encodeState from "src/util/encodeState";
const log = debug("api:backend");

const zMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SETUP") }),
  z.object({
    type: z.literal("OPEN_PAGE"),
    notebookPageId: z.string(),
  }),
  z.object({
    type: z.literal("ENSURE_PAGE_BY_TITLE"),
    title: zSamePageSchema,
    path: z.string().optional(),
  }),
  z.object({
    type: z.literal("DELETE_PAGE"),
    notebookPageId: z.string(),
  }),
  z.object({
    type: z.literal("ENCODE_STATE"),
    notebookPageId: z.string(),
    notebookUuid: z.string(),
  }),
  z.object({
    type: z.literal("DECODE_STATE"),
    notebookPageId: z.string(),
    state: zSamePageState,
  }),
]);

const logic = async (args: BackendRequest<typeof zMessage>) => {
  const { authorization, ...data } = args;
  if (!authorization) {
    throw new Error("Unauthorized");
  }
  log("backend post", data.type);

  const accessToken = authorization.startsWith("Basic")
    ? await getAccessToken({
        authorization,
      }).then(({ accessToken }) => accessToken)
    : authorization.replace(/^Bearer /, "");
  try {
    switch (data.type) {
      case "SETUP": {
        // TODO: Do we need this anymore?
        return { success: true };
      }
      case "ENSURE_PAGE_BY_TITLE": {
        const { path = "", title } = data;
        return { notebookPageId: "TODO", preExisting: false };
      }
      case "DELETE_PAGE": {
        const { notebookPageId } = data;
        // TODO
        return { data: notebookPageId };
      }
      case "OPEN_PAGE": {
        const { notebookPageId } = data;
        // TODO
        return {
          url: notebookPageId,
        };
      }
      case "ENCODE_STATE": {
        const { notebookPageId } = data;
        // TODO
        return encodeState({ notebookPageId, token: accessToken });
      }
      case "DECODE_STATE": {
        const { notebookPageId, state } = data;
        return decodeState(notebookPageId, state, accessToken);
      }
      default:
        throw new Error(`Unknown type ${data["type"]}`);
    }
  } catch (e) {
    log("error", e);
    throw new Error(`Backend request ${data.type} failed`, { cause: e });
  }
};

const backend = createAPIGatewayProxyHandler({
  logic,
  // @ts-ignore
  bodySchema: zMessage,
  allowedOrigins: [/^https:\/\/([\w]+\.)?notion\.so/],
});

export default backend;
