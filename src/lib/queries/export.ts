import { gql } from "@apollo/client";

/** Trigger a CSV or PDF export for a given analytics scope. */
export const REQUEST_EXPORT = gql`
  mutation RequestExport($scope: AnalyticsScopeInput!, $format: ExportFormat!) {
    requestExport(scope: $scope, format: $format) {
      id
      format
      status
      downloadUrl
      message
      createdAt
    }
  }
`;
