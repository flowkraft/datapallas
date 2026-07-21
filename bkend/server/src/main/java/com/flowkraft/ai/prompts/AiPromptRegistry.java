package com.flowkraft.ai.prompts;

import java.util.List;

public final class AiPromptRegistry {

    private AiPromptRegistry() {}

    public static List<PromptDefinition> all() {
        return List.of(
            SqlFromNaturalLanguage.create(),
            SqlFromCubeDsl.create(),
            SqlQueryOptimization.create(),
            DbSchemaDomainGrouped.create(),
            DbSchemaErDiagramPlantuml.create(),
            CustomDbSeedScript.create(),
            CustomDbWipeScript.create(),
            BuildBillingPortalGrails.create(),
            BuildHrPortalGrails.create(),
            BuildBillingPortalNext.create(),
            BuildHrPortalNext.create(),
            BuildBillingPortalBackend.create(),
            BuildHrPortalBackend.create(),
            BuildTemplateFromScratch.create(),
            CreateSalesReportHtml.create(),
            ModifyExistingHtml.create(),
            ReplicateDesignFromScreenshot.create(),
            ReportParamsDslConfigure.create(),
            TabulatorDslConfigure.create(),
            ChartDslConfigure.create(),
            PivotTableDslConfigure.create(),
            CubeDslConfigure.create(),
            DashboardBuildLayout.create(),
            DashboardBuildStepByStep.create(),
            DashboardFromCubeDsl.create(),
            GroovyScriptInputSource.create(),
            GroovyScriptAdditionalTransformation.create(),
            GroovyScriptFromCubeDsl.create(),
            GroovyRestPublishToPortal.create(),
            SingleModelTemplateFromFields.create(),
            MyDocumentsListTemplateFromFields.create(),
            EmailPayslipNotification.create(),
            EmailInvoiceNotification.create(),
            EmailBoxed1columnResponsive.create(),
            EmailBoxed1columnImageResponsive.create(),
            EmailBoxed2columnResponsive.create(),
            EmailBoxed2columnImageResponsive.create(),
            EmailBoxed3columnResponsive.create(),
            ExcelTemplateGenerator.create(),
            JasperJrxmlTemplateGenerator.create(),
            PdfHtmlTemplateGenerator.create(),
            PdfSampleA4PayslipXslfo.create(),
            FilterPaneDslConfigure.create(),
            // Ask Athena — Athena's data & analytics flows
            AskAthenaAboutDataPallas.create(),
            ExploreMyData.create(),
            DiagramMyData.create(),
            MockupScreenOrDashboard.create(),
            WriteCustomProcessingScript.create(),
            SetupDocumentDistribution.create(),
            BuildPdfReport.create(),
            BuildPivotReport.create(),
            WriteRequirementsDoc.create(),
            ReplicateDataToWarehouse.create(),
            ShapeDataStarSchema.create(),
            SetupCloudBeaver.create(),
            BuildPublishDashboard.create()
        );
    }
}
