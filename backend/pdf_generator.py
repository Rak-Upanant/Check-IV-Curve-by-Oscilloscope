# backend/pdf_generator.py
import os, tempfile
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, Image
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

STATUS_COLOR = {
    "ok":      colors.HexColor("#00c471"),
    "warning": colors.HexColor("#f59e0b"),
    "fault":   colors.HexColor("#ef4444"),
}

def generate_report_pdf(session: dict) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()

    doc = SimpleDocTemplate(
        tmp.name, pagesize=A4,
        topMargin=15*mm, bottomMargin=15*mm,
        leftMargin=15*mm, rightMargin=15*mm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"],
                                  fontSize=18, textColor=colors.HexColor("#0f172a"),
                                  spaceAfter=4)
    sub_style   = ParagraphStyle("sub", parent=styles["Normal"],
                                  fontSize=10, textColor=colors.HexColor("#64748b"))
    head_style  = ParagraphStyle("head", parent=styles["Heading2"],
                                  fontSize=11, textColor=colors.HexColor("#1e293b"),
                                  spaceBefore=8, spaceAfter=4)

    board_name  = session.get("boards", {}).get("board_name", "—")
    tech        = session.get("technician", "—")
    test_date   = session.get("test_date", "")[:10]
    results     = session.get("test_results", [])

    ok_count      = sum(1 for r in results if r.get("status") == "ok")
    warning_count = sum(1 for r in results if r.get("status") == "warning")
    fault_count   = sum(1 for r in results if r.get("status") == "fault")
    overall = "PASS" if fault_count == 0 else "FAIL"

    story = []

    # Header
    story.append(Paragraph("I-V Signature Analysis Report", title_style))
    story.append(Paragraph(
        f"Board: <b>{board_name}</b> &nbsp;|&nbsp; Technician: <b>{tech}</b> "
        f"&nbsp;|&nbsp; Date: <b>{test_date}</b>", sub_style))
    story.append(HRFlowable(width="100%", thickness=1,
                             color=colors.HexColor("#e2e8f0"), spaceAfter=8))

    # Summary box
    summary_data = [
        ["Overall", "Test Points", "OK", "Warning", "Fault"],
        [overall, str(len(results)), str(ok_count), str(warning_count), str(fault_count)],
    ]
    summary_table = Table(summary_data, colWidths=[35*mm, 35*mm, 25*mm, 25*mm, 25*mm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR",    (0,0), (-1,0), colors.white),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("ROWHEIGHT",    (0,0), (-1,-1), 8*mm),
        ("BACKGROUND",   (0,1), (0,1),
         colors.HexColor("#00c471") if overall == "PASS" else colors.HexColor("#ef4444")),
        ("TEXTCOLOR",    (0,1), (0,1), colors.white),
        ("FONTNAME",     (0,1), (0,1), "Helvetica-Bold"),
        ("FONTSIZE",     (0,1), (0,1), 14),
        ("GRID",         (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROUNDEDCORNERS", [3]),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 8*mm))

    # Results table
    story.append(Paragraph("Test Point Results", head_style))
    rows = [["Point", "Component", "Shape", "Score", "Status", "Diagnosis"]]
    for r in sorted(results, key=lambda x: x.get("test_points",{}).get("point_name","")):
        pt     = r.get("test_points", {})
        status = r.get("status", "—")
        rows.append([
            pt.get("point_name", "—"),
            pt.get("component_type", "—"),
            r.get("shape_type", "—"),
            f"{r.get('similarity_score', 0):.1f}",
            status.upper(),
            r.get("diagnosis", "—"),
        ])

    col_w = [25*mm, 30*mm, 35*mm, 20*mm, 22*mm, 35*mm]
    result_table = Table(rows, colWidths=col_w)
    ts = [
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#334155")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTSIZE",   (0,0), (-1,-1), 8),
        ("ALIGN",      (0,0), (-1,-1), "CENTER"),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("ROWHEIGHT",  (0,0), (-1,-1), 7*mm),
        ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1),
         [colors.HexColor("#f8fafc"), colors.white]),
    ]
    for i, r in enumerate(results, start=1):
        c = STATUS_COLOR.get(r.get("status",""), colors.gray)
        ts.append(("BACKGROUND", (4,i), (4,i), c))
        ts.append(("TEXTCOLOR",  (4,i), (4,i), colors.white))
        ts.append(("FONTNAME",   (4,i), (4,i), "Helvetica-Bold"))
    result_table.setStyle(TableStyle(ts))
    story.append(result_table)

    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} &nbsp;|&nbsp; "
        "I-V Signature Analysis System v1.0", sub_style))

    doc.build(story)
    return tmp.name
