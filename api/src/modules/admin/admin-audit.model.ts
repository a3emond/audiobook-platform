import mongoose, {
	Schema,
	type HydratedDocument,
	type InferSchemaType,
	type Model,
} from "mongoose";

const adminAuditSchema = new Schema(
	{
		actorUserId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		method: {
			type: String,
			required: true,
			index: true,
		},
		path: {
			type: String,
			required: true,
			index: true,
		},
		statusCode: {
			type: Number,
			required: true,
			index: true,
		},
		targetUserId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			default: null,
			index: true,
		},
		targetBookId: {
			type: Schema.Types.ObjectId,
			ref: "Book",
			default: null,
			index: true,
		},
		requestId: {
			type: String,
			default: null,
		},
		ip: {
			type: String,
			default: null,
		},
		userAgent: {
			type: String,
			default: null,
		},
		metadata: {
			type: Schema.Types.Mixed,
			default: null,
		},
	},
	{
		timestamps: { createdAt: true, updatedAt: false },
		versionKey: false,
	},
);

adminAuditSchema.index({ actorUserId: 1, createdAt: -1 });
adminAuditSchema.index({ path: 1, createdAt: -1 });

export type AdminAudit = InferSchemaType<typeof adminAuditSchema>;
export type AdminAuditDocument = HydratedDocument<AdminAudit>;
export type AdminAuditModelType = Model<AdminAudit>;

export const AdminAuditModel =
	(mongoose.models.AdminAudit as AdminAuditModelType | undefined) ||
	mongoose.model<AdminAudit>("AdminAudit", adminAuditSchema, "admin_audit");