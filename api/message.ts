import createBackendClientHandler from "samepage/backend/createBackendClientHandler";
import { apiGet } from "samepage/internal/apiClient";
import { notebookRequestNodeQuerySchema } from "samepage/internal/types";
import decodeState from "src/util/decodeState";
import encodeState from "src/util/encodeState";
import fireNodeQuery from "src/util/fireNodeQuery";

type ClickUpTask = { id: string; name: string };

// ClickUp's API sucks, so we're going to cache everything locally
const localClickUpDb: {
  [workspace: string]: {
    tasks?: ClickUpTask[];
  };
} = {};

const clickUpGet = <T extends Record<string, unknown>>({
  accessToken,
  path,
}: {
  accessToken: string;
  path: string;
}) =>
  apiGet<T>({
    domain: `https://api.clickup.com/api/v2`,
    authorization: accessToken,
    path,
  });

const getAllTasks = async ({
  accessToken,
  workspace,
}: {
  accessToken: string;
  workspace: string;
}) => {
  const cached = localClickUpDb[workspace]?.tasks;
  if (cached) return cached;
  const { spaces } = await clickUpGet<{ spaces: { id: string }[] }>({
    path: `team/${workspace}/space`,
    accessToken,
  });
  const folders = await Promise.all(
    spaces.map((s) =>
      clickUpGet<{ folders: { id: string }[] }>({
        path: `space/${s.id}/folder`,
        accessToken,
      })
    )
  ).then((r) => r.flatMap((r) => r.folders));
  const lists = await Promise.all(
    folders.map((s) =>
      clickUpGet<{ lists: { id: string }[] }>({
        path: `folder/${s.id}/list`,
        accessToken,
      })
    )
  ).then((r) => r.flatMap((r) => r.lists));
  const tasks = await Promise.all(
    lists.map((s) =>
      clickUpGet<{ tasks: { id: string; name: string }[] }>({
        path: `list/${s.id}/task`,
        accessToken,
      })
    )
  ).then((r) => r.flatMap((r) => r.tasks));
  return tasks;
};

const searchTasksByTitle = async ({
  accessToken,
  workspace,
  title,
}: {
  accessToken: string;
  workspace: string;
  title: string;
}) => {
  const tasks = await getAllTasks({ accessToken, workspace });
  return tasks.filter((t) => t.name === title);
};

const message = (args: Record<string, unknown>) => {
  return createBackendClientHandler({
    getDecodeState:
      ({ accessToken }) =>
      (id, state) => {
        return decodeState(id, state, accessToken);
      },
    getNotebookRequestHandler:
      ({ accessToken, workspace }) =>
      async ({ request }) => {
        localClickUpDb[workspace] = localClickUpDb[workspace] || {};
        if (request.schema === "node-query") {
          const result = notebookRequestNodeQuerySchema.safeParse(request);
          if (!result.success) return {};
          const results = await fireNodeQuery(result.data, {
            "has title": async ({ program, source, target, helpers }) => {
              const tasks = await searchTasksByTitle({
                accessToken,
                workspace,
                title: target,
              });
              if (program.vars.has(source)) {
                const validTaskIds = new Set(tasks.map((t) => t.id));
                const newAssignments = Object.entries(
                  program.assignments
                ).filter(([, value]) => {
                  const assignmentValue = value[source];
                  return (
                    helpers.isNode(assignmentValue) &&
                    validTaskIds.has(assignmentValue.id)
                  );
                });
                return {
                  assignments: Object.fromEntries(newAssignments),
                  vars: program.vars,
                };
              }
              return helpers.joinPrograms({
                program,
                vars: [source],
                matches: tasks.map((t) => ({
                  [source]: { id: t.id },
                })),
              });
            },
          });
          return {
            results,
          };
        } else if (typeof request.notebookPageId === "string") {
          const pageData = await encodeState({
            notebookPageId: request.notebookPageId,
            token: accessToken,
          });
          return pageData;
        }
        return {};
      },
    getNotebookResponseHandler: (creds) => async (response) => {
      // TODO
    },
  })(args);
};

export default message;
