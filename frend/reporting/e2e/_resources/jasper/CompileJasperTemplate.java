import net.sf.jasperreports.engine.JasperCompileManager;

/**
 * Compiles one .jrxml to .jasper. Used by the e2e suites to produce a genuinely
 * compiled sub-report, so the "customer shipped .jasper files" case is tested
 * with a real one rather than a checked-in binary that would rot.
 *
 * Run as a source file — no build step — against whichever JasperReports the
 * case needs: the JasperReports 7 jars in lib/burst, or the JasperReports 6 jars
 * inside the legacy container. A .jasper is version-specific, which is exactly
 * why each engine compiles its own.
 *
 *   java -cp "<jars>" CompileJasperTemplate.java <source.jrxml> <target.jasper>
 */
public class CompileJasperTemplate {
	public static void main(String[] args) throws Exception {
		JasperCompileManager.compileReportToFile(args[0], args[1]);
		System.out.println("COMPILED " + args[1]);
	}
}
