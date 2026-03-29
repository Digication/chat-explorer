export interface GraphQLContext {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: string;
    institutionId: string | null;
  } | null;
}
