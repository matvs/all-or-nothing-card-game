import Badge from "react-bootstrap/Badge";
import Table from "react-bootstrap/Table";
import type { ExplanationRow } from "../../shared/engine/index.js";

/**
 * The recovered "Explanation" table: one row per property (color / shape /
 * filling / number) with YES/NO badges for "All the same" and "All different".
 */
export function ExplanationTable({ rows }: { rows: ExplanationRow[] }) {
  return (
    <Table striped bordered hover size="sm" className="explanation-table mb-0">
      <thead>
        <tr>
          <th>Property</th>
          <th>All the same</th>
          <th>All different</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.property}>
            <td className="text-capitalize">{row.property}</td>
            <td>
              {row.allSame ? <Badge bg="success">YES</Badge> : <Badge bg="danger">NO</Badge>}
            </td>
            <td>
              {row.eachDifferent ? <Badge bg="success">YES</Badge> : <Badge bg="danger">NO</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
