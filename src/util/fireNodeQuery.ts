// This algorithm is heavily inspired by datalog
import type { notebookRequestNodeQuerySchema } from "samepage/internal/types";
import { z } from "zod";
import crypto from "crypto";

type NodeAssignment = { id: string };
type AssignmentValue = NodeAssignment | string | number | RegExp;
type Assignment = Record<string, AssignmentValue>;
const isNode = (v: Assignment[string]): v is NodeAssignment =>
  typeof v === "object" && v !== null && !(v instanceof RegExp);
type Program = {
  assignments: Record<string, Assignment>;
  vars: Set<string>;
};

const hashAssignment = (assignment: Assignment) => {
  const hash = crypto.createHash("sha256");
  Object.keys(assignment)
    .sort()
    .forEach((key) => {
      const raw = assignment[key];
      const value = isNode(raw)
        ? raw.id
        : raw instanceof RegExp
        ? raw.source
        : typeof raw === "number"
        ? raw.toString()
        : raw;
      hash.update(key).update(value);
    });
  return hash.digest("hex");
};

const joinPrograms = ({
  program,
  matches,
  vars,
}: {
  program: Program;
  matches: Assignment[];
  vars: string[];
}) => {
  return {
    vars: new Set([...program.vars, ...vars]),
    assignments: {
      ...program.assignments,
      ...Object.fromEntries(
        matches.map((match) => [hashAssignment(match), match])
      ),
    },
  };
};

const fireNodeQuery = async (
  args: z.infer<typeof notebookRequestNodeQuerySchema>,
  context: Record<
    string,
    (args: {
      program: Program;
      source: string;
      target: string;
      helpers: { isNode: typeof isNode; joinPrograms: typeof joinPrograms };
    }) => Promise<Program>
  >
) => {
  const getAssignments = async (
    conditions: z.infer<typeof notebookRequestNodeQuerySchema>["conditions"],
    initialVars: string[] = []
  ) => {
    const { assignments } = await conditions.reduce(
      (prev, condition, index) =>
        prev.then(async (program) => {
          if (Object.keys(program.assignments).length === 0 && index > 0)
            return program;
          const handler = context[condition.relation];
          if (!handler) return program;
          return handler({
            program,
            source: condition.source,
            target: condition.target,
            helpers: {
              isNode,
              joinPrograms,
            },
          });
        }),
      Promise.resolve<Program>({
        assignments: {},
        vars: new Set<string>(initialVars),
      })
    );
    return assignments;
  };
  const assignments = await getAssignments(args.conditions);
  const results = Object.values(assignments).map((res) => {
    const returnNodeValue = res[args.returnNode];
    const returnNode = isNode(returnNodeValue)
      ? returnNodeValue
      : typeof returnNodeValue !== "object"
      ? { id: returnNodeValue.toString() }
      : { id: returnNodeValue.source };
    return args.selections.reduce((result, selection) => {
      return result;
    }, returnNode);
  });
  return results;
};

export default fireNodeQuery;
